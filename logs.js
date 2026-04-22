// logs.js - 日志查看页面脚本

// 格式化时间
function formatTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;

    // 如果是今天
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    // 如果是昨天
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return 'Hôm qua ' + date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    // 其他日期
    return date.toLocaleString('vi-VN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 渲染日志
function renderLogs(logs) {
    const container = document.getElementById('logsContainer');

    if (!logs || logs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <div>Không có bản ghi nhật ký nào</div>
            </div>
        `;
        return;
    }

    container.innerHTML = logs.map(log => {
        const detailsHtml = log.details
            ? `<div class="log-details">${JSON.stringify(log.details, null, 2)}</div>`
            : '';

        return `
            <div class="log-entry ${log.level}">
                <div class="log-header">
                    <span class="log-level ${log.level}">${log.level}</span>
                    <span class="log-time">${formatTime(log.timestamp)}</span>
                </div>
                <div class="log-message">${log.message}</div>
                ${detailsHtml}
            </div>
        `;
    }).join('');
}

// 加载日志
async function loadLogs() {
    chrome.runtime.sendMessage({ action: 'getLogs' }, (response) => {
        if (response && response.success) {
            renderLogs(response.logs);
        } else {
            document.getElementById('logsContainer').innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <div>Tải nhật ký thất bại</div>
                </div>
            `;
        }
    });
}

// 清空日志
async function clearLogs() {
    if (!confirm('Bạn có chắc chắn muốn xóa tất cả nhật ký không?')) {
        return;
    }

    chrome.runtime.sendMessage({ action: 'clearLogs' }, (response) => {
        if (response && response.success) {
            loadLogs();
        }
    });
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadLogs();

    // 刷新按钮
    document.getElementById('refreshBtn').addEventListener('click', loadLogs);

    // 清空按钮
    document.getElementById('clearBtn').addEventListener('click', clearLogs);

    // 返回按钮
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = 'popup.html';
    });

    // 自动刷新（每5秒）
    setInterval(loadLogs, 5000);
});
