// popup.js - Chrome扩展配置界面脚本

document.addEventListener('DOMContentLoaded', async () => {
    // 加载已保存的配置
    const config = await chrome.storage.sync.get(['apiUrl', 'connectionToken', 'refreshInterval']);

    if (config.apiUrl) {
        document.getElementById('apiUrl').value = config.apiUrl;
    }
    if (config.connectionToken) {
        document.getElementById('connectionToken').value = config.connectionToken;
    }
    if (config.refreshInterval) {
        document.getElementById('refreshInterval').value = config.refreshInterval;
    }

    // 保存配置
    document.getElementById('saveBtn').addEventListener('click', async () => {
        const apiUrl = document.getElementById('apiUrl').value.trim();
        const connectionToken = document.getElementById('connectionToken').value.trim();
        const refreshInterval = parseInt(document.getElementById('refreshInterval').value);

        if (!apiUrl || !connectionToken) {
            showStatus('Vui lòng điền đầy đủ thông tin cấu hình', 'error');
            return;
        }

        if (refreshInterval < 1 || refreshInterval > 1440) {
            showStatus('Thời gian làm mới phải từ 1-1440 phút', 'error');
            return;
        }

        // 保存配置
        await chrome.storage.sync.set({
            apiUrl,
            connectionToken,
            refreshInterval
        });

        // 通知background script更新定时器
        chrome.runtime.sendMessage({
            action: 'updateConfig',
            config: { apiUrl, connectionToken, refreshInterval }
        });

        showStatus('Lưu cấu hình thành công!', 'success');
    });

    // 立即测试
    document.getElementById('testBtn').addEventListener('click', async () => {
        const apiUrl = document.getElementById('apiUrl').value.trim();
        const connectionToken = document.getElementById('connectionToken').value.trim();

        if (!apiUrl || !connectionToken) {
            showStatus('Vui lòng điền và lưu cấu hình trước', 'error');
            return;
        }

        showStatus('Đang kiểm tra kết nối...', 'info');

        // 通知background script立即执行一次
        chrome.runtime.sendMessage({
            action: 'testNow'
        }, (response) => {
            if (response && response.success) {
                // 根据action显示不同的成功信息
                let statusMessage = '';
                if (response.action === 'updated') {
                    statusMessage = `✅ Kiểm tra thành công! Token đã được cập nhật\n${response.message}`;
                } else if (response.action === 'added') {
                    statusMessage = `✅ Kiểm tra thành công! Token đã được thêm\n${response.message}`;
                } else {
                    statusMessage = `✅ Kiểm tra thành công! ${response.message}`;
                }
                showStatus(statusMessage, 'success');
            } else {
                showStatus(`❌ Kiểm tra thất bại: ${response ? response.error : 'Lỗi không xác định'}`, 'error');
            }
        });
    });

    // 查看日志
    document.getElementById('logsBtn').addEventListener('click', () => {
        window.location.href = 'logs.html';
    });
});

function showStatus(message, type) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.style.display = 'block';

    // 3秒后自动隐藏
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 3000);
}
