document.addEventListener('DOMContentLoaded', function() {
    const notificationsToggle = document.getElementById('notificationsToggle');
    const notificationsList = document.getElementById('notificationsList');
    const notificationBadge = document.querySelector('.notification-badge');
    let unreadCount = 0;

    // 알림 토글
    notificationsToggle.addEventListener('click', function(e) {
        e.preventDefault();
        notificationsList.style.display = notificationsList.style.display === 'none' ? 'block' : 'none';
        
        // 알림 목록이 열릴 때 모든 알림을 읽음 처리
        if (notificationsList.style.display === 'block') {
            markAllAsRead();
        }
    });

    // 알림 추가 함수
    function addNotification(notification) {
        const notificationItem = document.createElement('div');
        notificationItem.className = 'list-group-item notification-item';
        
        // 시간 포맷팅
        const time = notification.timestamp ? 
            new Date(notification.timestamp).toLocaleString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }) : 
            new Date().toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

        notificationItem.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <small class="text-muted">${time}</small>
                    <p class="mb-1">${notification.message}</p>
                </div>
                ${notification.unread ? '<span class="badge bg-primary">New</span>' : ''}
            </div>
        `;
        
        notificationsList.insertBefore(notificationItem, notificationsList.firstChild);
        
        if (notification.unread) {
            unreadCount++;
            updateBadge();
        }
    }

    // 알림 배지 업데이트
    function updateBadge() {
        if (unreadCount > 0) {
            notificationBadge.textContent = unreadCount;
            notificationBadge.style.display = 'block';
        } else {
            notificationBadge.style.display = 'none';
        }
    }

    // 모든 알림을 읽음 처리
    function markAllAsRead() {
        unreadCount = 0;
        updateBadge();
        document.querySelectorAll('.notification-item .badge').forEach(badge => {
            badge.remove();
        });
    }

    // Socket.IO를 통한 실시간 알림 수신
    // window.socket 객체 사용 (socket.js에서 생성된 전역 소켓)
    window.socket.on('notification', function(notification) {
        console.log('알림 수신:', notification);
        addNotification({
            message: notification.message,
            timestamp: notification.timestamp || new Date(),
            unread: true
        });
    });

    // 알림 목록 외부 클릭 시 닫기
    document.addEventListener('click', function(e) {
        if (!notificationsToggle.contains(e.target) && !notificationsList.contains(e.target)) {
            notificationsList.style.display = 'none';
        }
    });
}); 