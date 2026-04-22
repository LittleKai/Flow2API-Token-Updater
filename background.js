// background.js - Script chạy ngầm của Chrome Extension

// Tên bộ đếm thời gian
const ALARM_NAME = 'tokenRefresh';

// Hệ thống log
const Logger = {
    async log(level, message, details = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            details
        };

        console.log(`[${level}] ${message}`, details || '');

        // Lưu vào chrome.storage.local (chỉ có hiệu lực trong phiên hiện tại)
        const { logs = [] } = await chrome.storage.local.get(['logs']);
        logs.unshift(logEntry); // Mới nhất ở đầu

        // Chỉ giữ lại 50 log gần nhất
        if (logs.length > 50) {
            logs.splice(50);
        }

        await chrome.storage.local.set({ logs });
    },

    info(message, details) {
        return this.log('INFO', message, details);
    },

    error(message, details) {
        return this.log('ERROR', message, details);
    },

    success(message, details) {
        return this.log('SUCCESS', message, details);
    },

    async getLogs() {
        const { logs = [] } = await chrome.storage.local.get(['logs']);
        return logs;
    },

    async clearLogs() {
        await chrome.storage.local.set({ logs: [] });
    }
};

// Khởi tạo: thiết lập bộ đếm thời gian
chrome.runtime.onInstalled.addListener(async () => {
    await Logger.info('Flow2API Token Updater installed');
    await setupAlarm();
});

// Lắng nghe tin nhắn từ popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateConfig') {
        // Khởi động lại bộ đếm sau khi cập nhật cấu hình
        setupAlarm().then(async () => {
            await Logger.info('Config updated, alarm reset');
        });
    } else if (request.action === 'testNow') {
        // Thực thi ngay lập tức một lần
        extractAndSendToken().then((result) => {
            sendResponse(result);
        }).catch((error) => {
            sendResponse({ success: false, error: error.message });
        });
        return true; // Giữ kênh tin nhắn mở
    } else if (request.action === 'getLogs') {
        // Lấy log
        Logger.getLogs().then((logs) => {
            sendResponse({ success: true, logs });
        });
        return true;
    } else if (request.action === 'clearLogs') {
        // Xóa log
        Logger.clearLogs().then(() => {
            sendResponse({ success: true });
        });
        return true;
    }
});

// Lắng nghe trigger từ bộ đếm
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        await Logger.info('Alarm triggered, extracting token...');
        const result = await extractAndSendToken();

        // Gửi thông báo
        if (result.success) {
            const title = result.action === 'updated' ? '✅ Token Đã Cập Nhật' : '✅ Token Đã Thêm';
            const message = result.displayMessage || result.message || 'Token đã được đồng bộ hóa thành công đến Flow2API';

            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon48.png',
                title: title,
                message: message
            });
        } else {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon48.png',
                title: '❌ Đồng Bộ Token Thất Bại',
                message: result.error || 'Lỗi không xác định'
            });
        }
    }
});

// Thiết lập bộ đếm thời gian
async function setupAlarm() {
    // Xóa bộ đếm cũ
    await chrome.alarms.clear(ALARM_NAME);

    // Lấy cấu hình
    const config = await chrome.storage.sync.get(['refreshInterval']);
    const intervalMinutes = config.refreshInterval || 60;

    // Tạo bộ đếm mới
    chrome.alarms.create(ALARM_NAME, {
        periodInMinutes: intervalMinutes
    });

    await Logger.info(`Alarm set to ${intervalMinutes} minutes`);
}

// Trích xuất cookie và gửi đến máy chủ
async function extractAndSendToken() {
    let tab = null;

    try {
        await Logger.info('Bắt đầu trích xuất Token...');

        // Lấy cấu hình
        const config = await chrome.storage.sync.get(['apiUrl', 'connectionToken']);

        if (!config.apiUrl || !config.connectionToken) {
            await Logger.error('Chưa thiết lập cấu hình');
            return { success: false, error: 'Chưa thiết lập cấu hình' };
        }

        await Logger.info('Đã tải cấu hình', { apiUrl: config.apiUrl });

        // 1. Mở trang Google Labs (trong nền)
        await Logger.info('Đang mở trang Google Labs...');
        tab = await chrome.tabs.create({
            url: 'https://labs.google/fx/vi/tools/flow',
            active: false
        });

        await Logger.info('Trang đã được tạo, đang chờ tải...', { tabId: tab.id });

        // Chờ trang tải hoàn tất
        await new Promise((resolve) => {
            const listener = (tabId, changeInfo) => {
                if (tabId === tab.id && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });

        await Logger.info('Trang đã tải xong, đợi thực thi JavaScript...');

        // Tăng thời gian chờ lên 5 giây để đảm bảo JavaScript thực thi xong
        await new Promise(resolve => setTimeout(resolve, 5000));

        await Logger.info('Bắt đầu trích xuất Cookies...');

        // 2. Lấy session-token
        let sessionToken = null;
        let allCookiesFound = [];

        // Thử lấy tất cả các cookie liên quan đến google
        try {
            // Cách 1: lấy toàn bộ cookie của tab hiện tại
            const tabCookies = await chrome.cookies.getAll({ url: 'https://labs.google/fx/vi/tools/flow' });
            allCookiesFound.push(...tabCookies);
            await Logger.info(`Tìm thấy ${tabCookies.length} cookie từ URL của tab`);

            // Cách 2: lấy toàn bộ cookie của tên miền labs.google
            const labsCookies = await chrome.cookies.getAll({ domain: 'labs.google' });
            allCookiesFound.push(...labsCookies);
            await Logger.info(`Tìm thấy ${labsCookies.length} cookie từ tên miền labs.google`);

            // Cách 3: lấy toàn bộ cookie của tên miền .google.com
            const googleCookies = await chrome.cookies.getAll({ domain: '.google.com' });
            allCookiesFound.push(...googleCookies);
            await Logger.info(`Tìm thấy ${googleCookies.length} cookie từ tên miền .google.com`);

        } catch (err) {
            await Logger.error('Lấy cookies thất bại', { error: err.message });
        }

        // Loại bỏ các cookie trùng lặp
        const uniqueCookies = Array.from(
            new Map(allCookiesFound.map(c => [c.name + c.domain, c])).values()
        );

        await Logger.info(`Tổng cộng tìm thấy ${uniqueCookies.length} cookie duy nhất`, {
            cookieNames: uniqueCookies.map(c => ({ name: c.name, domain: c.domain }))
        });

        // Tìm kiếm session-token
        for (const cookie of uniqueCookies) {
            if (cookie.name === '__Secure-next-auth.session-token' && !sessionToken) {
                sessionToken = cookie.value;
                await Logger.success('Đã tìm thấy session-token', {
                    domain: cookie.domain,
                    path: cookie.path,
                    length: sessionToken.length
                });
                break;
            }
        }

        // Đóng tab
        if (tab) {
            await chrome.tabs.remove(tab.id);
            await Logger.info('Đã đóng tab');
        }

        if (!sessionToken) {
            await Logger.error('Không tìm thấy session-token', {
                foundCookies: uniqueCookies.map(c => ({
                    name: c.name,
                    domain: c.domain
                }))
            });

            return {
                success: false,
                error: 'Không tìm thấy session-token. Vui lòng đảm bảo bạn đã đăng nhập vào Google Labs.'
            };
        }

        await Logger.info('Trích xuất Session-token thành công', { tokenLength: sessionToken.length });

        // 4. Gửi đến máy chủ
        await Logger.info('Đang gửi đến máy chủ...');

        const response = await fetch(config.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.connectionToken}`
            },
            body: JSON.stringify({
                session_token: sessionToken
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            await Logger.error('Lỗi máy chủ', {
                status: response.status,
                error: errorText
            });
            return { success: false, error: `Lỗi máy chủ: ${response.status}` };
        }

        const result = await response.json();

        // Hiển thị các thông báo log khác nhau dựa trên action
        if (result.action === 'updated') {
            await Logger.success('✅ Token đã được cập nhật lên máy chủ', {
                action: 'Cập nhật Token hiện tại',
                message: result.message
            });
        } else if (result.action === 'added') {
            await Logger.success('✅ Token đã được thêm lên máy chủ', {
                action: 'Thêm Token mới',
                message: result.message
            });
        } else {
            await Logger.success('✅ Token đã được đồng bộ lên máy chủ', result);
        }

        return {
            success: true,
            message: result.message || 'Cập nhật Token thành công',
            action: result.action,
            displayMessage: result.action === 'updated'
                ? `✅ Cập nhật thành công lên máy chủ\n${result.message}`
                : `✅ Thêm mới thành công lên máy chủ\n${result.message}`
        };

    } catch (error) {
        await Logger.error('Lỗi trong quá trình trích xuất', {
            error: error.message,
            stack: error.stack
        });

        // Đảm bảo tab đã được đóng
        if (tab) {
            try {
                await chrome.tabs.remove(tab.id);
            } catch (e) {
                // Bỏ qua lỗi khi đóng tab
            }
        }

        return { success: false, error: error.message };
    }
}
