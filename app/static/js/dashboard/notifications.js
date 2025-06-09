document.addEventListener('DOMContentLoaded', function() {
    const notificationsToggle = document.getElementById('notificationsToggle');
    const notificationsList = document.getElementById('notificationsList');
    const notificationBadge = document.querySelector('.notification-badge');

    const menuToggle = document.getElementById('menuToggle');
    const sidebarNotificationBadge = menuToggle.querySelector('.sidebar-notification-badge');

    let unreadCount = 0;
    let isNotificationsOpen = false;

    // 알림 토글
    notificationsToggle.addEventListener('click', function(e) {
        e.preventDefault();
        const wasOpen = notificationsList.style.display === 'block';
        notificationsList.style.display = wasOpen ? 'none' : 'block';
        isNotificationsOpen = !wasOpen;
        
        // 알림창이 닫힐 때만 읽음 처리
        if (wasOpen) {
            markAllAsRead();
        }
    });

    // 알림 및 초대 추가 함수
    function addAlert(alertItem, type) {
        const alertElement = document.createElement('div');
        alertElement.className = 'list-group-item notification-item';
        alertElement.dataset.alertId = alertItem.id;

        if (type === 'notification') {
            const time = alertItem.timestamp ? 
                new Date(alertItem.timestamp).toLocaleString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }) : 
                new Date().toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });

            alertElement.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <div class="flex-grow-1">
                        <small class="text-muted">${time}</small>
                        <p class="mb-1">${alertItem.message}</p>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        ${!alertItem.read ? '<span class="badge bg-primary">New</span>' : ''}
                        <button class="btn btn-sm btn-outline-danger delete-notification" data-notification-id="${alertItem.id}">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            if (!alertItem.read) {
                unreadCount++;
                updateBadge();
            }
        } else {
            alertElement.classList.add('invitation-item');
            alertElement.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <div class="flex-grow-1">
                        <p class="mb-1"><strong>초대:</strong> ${alertItem.nickname || alertItem.name || "알 수 없음"}님의 프로젝트 초대</p>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <div class="invitation-actions" style="display: none;">
                            <button class="btn btn-sm btn-success accept-invite" data-project-id="${alertItem.id}">수락</button>
                            <button class="btn btn-sm btn-danger decline-invite" data-project-id="${alertItem.id}">거절</button>
                        </div>
                    </div>
                </div>
            `;
            unreadCount++;
            updateBadge();

            alertElement.addEventListener('click', function(event) {
                if (event.target.closest('.accept-invite') || 
                    event.target.closest('.decline-invite')) {
                    return;
                }
                const actionsDiv = this.querySelector('.invitation-actions');
                if (actionsDiv) {
                    actionsDiv.style.display = actionsDiv.style.display === 'none' ? 'block' : 'none';
                }
            });
        }

        // 알림을 시간순으로 정렬하여 추가
        const notifications = Array.from(notificationsList.children);
        const timestamp = alertItem.timestamp ? new Date(alertItem.timestamp).getTime() : new Date().getTime();
        
        let inserted = false;
        for (let i = 0; i < notifications.length; i++) {
            const existingTimestamp = notifications[i].dataset.timestamp ? 
                new Date(notifications[i].dataset.timestamp).getTime() : 
                new Date().getTime();
            
            if (timestamp > existingTimestamp) {
                notificationsList.insertBefore(alertElement, notifications[i]);
                inserted = true;
                break;
            }
        }
        
        if (!inserted) {
            notificationsList.appendChild(alertElement);
        }
        
        // 타임스탬프를 dataset에 저장
        alertElement.dataset.timestamp = alertItem.timestamp || new Date().toISOString();

        // 삭제 버튼 이벤트 리스너 추가
        const deleteButton = alertElement.querySelector('.delete-notification');
        if (deleteButton) {
            deleteButton.addEventListener('click', function(e) {
                e.stopPropagation();
                const notificationId = this.dataset.notificationId;
                deleteNotification(notificationId, alertElement);
            });
        }
    }

    // 알림 배지 업데이트
    function updateBadge() {
        if (unreadCount > 0) {
            notificationBadge.textContent = unreadCount;
            notificationBadge.style.display = 'block';
            if (sidebarNotificationBadge) {
                sidebarNotificationBadge.style.display = 'block';
            }
        } else {
            notificationBadge.style.display = 'none';
            if (sidebarNotificationBadge) {
                sidebarNotificationBadge.style.display = 'none';
            }
        }
    }

    // 모든 알림을 읽음 처리 (DB 연동)
    function markAllAsRead() {
        if (unreadCount > 0 && !isNotificationsOpen) { // 알림창이 닫혀있을 때만 읽음 처리
            window.socket.emit('mark_all_notifications_as_read');
        }
    }

    // 서버로부터 모든 알림 읽음 처리 완료 응답 수신
    window.socket.on('all_notifications_read', function() {
        console.log('모든 알림 읽음 처리 완료');
        unreadCount = 0; 
        updateBadge();
        document.querySelectorAll('.notification-item .badge').forEach(badge => {
            badge.remove();
        });
        loadNotificationsAndInvitations(); 
    });

    // Socket.IO를 통한 실시간 알림 수신 (DB 저장 후 전달됨)
    window.socket.on('notification', function(notification) {
        console.log('실시간 알림 수신:', notification);
        addAlert(notification, 'notification');
    });

    // 프로젝트 초대 이벤트 수신
    window.socket.on("invite_project", data => {
        console.log("초대 이벤트 수신:", data);
        addAlert({
            id: data.project_id, 
            nickname: data.invitee_nickname || "알 수 없음", 
            message: `새로운 프로젝트 초대: ${data.project_name || ''} (${data.invitee_nickname || '알 수 없음'})` 
        }, 'invitation');
        loadNotificationsAndInvitations();
    });

    // 초대 응답 이벤트 수신 (수락/거절)
    window.socket.on("invite_response", data => {
        console.log("초대 응답 이벤트 수신:", data);
        const project_id = data.project_id;
        const nickname = data.nickname;

        if (data.accepted) {
            if (window.currentUserNickname === nickname) {
                alert("초대를 수락했습니다.");
                window.location.reload(); 
            } else {
                alert("👤 새 멤버 참여: " + nickname);
                const cardEl = document.querySelector(`.project-card-wrapper[data-project-id="${project_id}"]`);
                if (cardEl) {
                    const countEl = cardEl.querySelector(".member-count");
                    if (countEl) {
                        const current = parseInt(countEl.textContent) || 0;
                        countEl.textContent = `${current + 1} members`;
                        console.log("멤버 수 갱신:", countEl.textContent);
                    }
                }
            }
        } else {
            if (window.currentUserNickname === nickname) {
                alert("초대를 거절했습니다.");
            } else {
                alert("👤 " + nickname + " 님이 초대를 거절했습니다.");
            }
        }
        loadNotificationsAndInvitations();
    });

    // 알림 목록 외부 클릭 시 닫기
    document.addEventListener('click', function(e) {
        if (!notificationsToggle.contains(e.target) && !notificationsList.contains(e.target)) {
            if (notificationsList.style.display === 'block') {
                notificationsList.style.display = 'none';
                isNotificationsOpen = false;
                markAllAsRead(); // 알림창이 닫힐 때 읽음 처리
            }
        }
    });

    // 페이지 로드 시 알림 및 초대 불러오기
    async function loadNotificationsAndInvitations() {
        console.log('알림 및 초대 불러오기 요청');
        notificationsList.innerHTML = ''; 
        unreadCount = 0; 

        // Fetch regular notifications
        window.socket.emit('get_notifications');

        // Fetch invitations via HTTP GET (as in invitations.js)
        try {
            const response = await fetch("/invitations");
            if (response.ok) {
                const data = await response.json();
                data.invitations.forEach(invitation => {
                    addAlert(invitation, 'invitation');
                });
            } else {
                const error = await response.json();
                console.error("초대 목록 로드 실패:", error.message);
            }
        } catch (err) {
            console.error("Load invitations error:", err);
        }
        updateBadge(); 
        attachInvitationButtonHandlers(); 
    }

    // 서버로부터 저장된 알림 목록 수신 (regular notifications)
    window.socket.on('notifications_loaded', function(data) {
        console.log('저장된 알림 수신:', data.notifications);
        data.notifications.forEach(notification => {
            addAlert(notification, 'notification');
        });
        updateBadge(); 
    });

    // 초대 수락/거절 버튼 이벤트 핸들러
    function attachInvitationButtonHandlers() {
        document.querySelectorAll(".invitation-item .accept-invite, .invitation-item .decline-invite").forEach(button => {
            button.removeEventListener("click", handleInvitationResponse);
            button.addEventListener("click", handleInvitationResponse);
        });
    }

    // 초대 보내기 (새로 추가된 로직)
    const sendInviteButton = document.getElementById("sendInvite");
    if (sendInviteButton) {
        sendInviteButton.addEventListener("click", async () => {
            const form = document.getElementById("inviteMemberForm");
            const formData = new FormData(form);
            const projectId = document.getElementById("inviteProjectId").value;
            const data = {
                nickname: formData.get("nickname")
            };
            try {
                const response = await fetch(`/projects/${projectId}/invite`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data)
                });
                if (response.ok) {
                    alert("초대가 전송되었습니다.");
                    window.socket.emit('invite_project', {
                        project_id: projectId,
                        invitee_nickname: data.nickname,
                    });
                    console.log("초대 이벤트 전송:", {
                        project_id: projectId,
                        invitee_nickname: data.nickname,
                    });
                    // Bootstrap 모달을 닫는 로직 (Bootstrap 5)
                    const inviteMemberModal = bootstrap.Modal.getInstance(document.getElementById("inviteMemberModal"));
                    if (inviteMemberModal) {
                        inviteMemberModal.hide();
                    }
                    form.reset();
                } else {
                    const error = await response.json();
                    alert(error.message || "초대 전송 실패");
                }
            } catch (error) {
                console.error("Error sending invite:", error);
                alert("오류가 발생했습니다.");
            }
        });
    }

    async function handleInvitationResponse() {
        const projectId = this.dataset.projectId;
        const action = this.classList.contains("accept-invite") ? "accept" : "decline";
        try {
            const response = await fetch("/invitations/respond", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ project_id: projectId, action })
            });
            if (response.ok) {
                if (action === "accept") {
                    window.socket.emit("respond_invite", { project_id: projectId , accepted: true });
                } else if (action === "decline") {
                    window.socket.emit("respond_invite", { project_id: projectId , accepted: false });
                }
                const invitationItem = this.closest('.invitation-item');
                if (invitationItem) {
                    invitationItem.remove();
                    loadNotificationsAndInvitations(); 
                }
            } else {
                const error = await response.json();
                alert(error.message || "초대 응답 실패");
            }
        } catch (err) {
            console.error("Respond invitation error:", err);
            alert("오류가 발생했습니다.");
        }
    }

    // 알림 삭제 함수
    function deleteNotification(notificationId, alertElement) {
        if (confirm('이 알림을 삭제하시겠습니까?')) {
            window.socket.emit('delete_notification', { notification_id: notificationId });
            
            // UI에서 즉시 제거
            if (alertElement) {
                const wasUnread = alertElement.querySelector('.badge.bg-primary') !== null;
                if (wasUnread) {
                    unreadCount = Math.max(0, unreadCount - 1);
                    updateBadge();
                }
                alertElement.remove();
            }
        }
    }

    // 서버로부터 알림 삭제 완료 응답 수신
    window.socket.on('notification_deleted', function(data) {
        console.log('알림 삭제 완료:', data);
        // 서버에서 삭제가 완료되면 추가 작업이 필요한 경우 여기에 구현
    });

    // 초기 알림 및 초대 로드
    loadNotificationsAndInvitations();
}); 