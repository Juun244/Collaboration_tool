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
        } else {
            // 알림창이 열릴 때 최신 알림 다시 로드
            loadNotificationsAndInvitations();
        }
    });

    // 알림 및 초대 추가 함수
    function addAlert(alertItem) {
        console.log("Adding alert:", alertItem); // Debugging: log the alert item
        const alertElement = document.createElement('div');
        alertElement.className = 'list-group-item notification-item';
        alertElement.dataset.alertId = alertItem.id;

        let time;
        try {
            time = alertItem.timestamp ? 
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
        } catch (e) {
            console.error("Error parsing timestamp for alert:", alertItem.id, alertItem.timestamp, e);
            time = new Date().toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }); // Fallback to current time
        }

        // 마감일 알림인지 확인
        const isDeadlineReminder = alertItem.type === 'deadline_reminder';
        // 프로젝트 초대 알림인지 확인
        const isProjectInvited = alertItem.type === 'project_invited';
        
        // 마감일 알림이면 특별한 스타일 적용
        if (isDeadlineReminder) {
            alertElement.classList.add('deadline-notification');
            alertElement.style.borderLeft = '4px solid #dc3545';
            alertElement.style.backgroundColor = '#fff5f5';
        }

        // 프로젝트 초대 알림이면 초대 스타일 적용
        if (isProjectInvited) {
            alertElement.classList.add('invitation-item');
        }

        alertElement.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div class="flex-grow-1">
                    <small class="text-muted">${time}</small>
                    <p class="mb-1">${alertItem.message}</p>
                    ${isDeadlineReminder ? '<small class="text-danger"><i class="bi bi-exclamation-triangle"></i> 마감일 알림</small>' : ''}
                    ${isProjectInvited ? '<small class="text-primary"><i class="bi bi-person-plus"></i> 프로젝트 초대</small>' : ''}
                </div>
                <div class="d-flex align-items-center gap-2">
                    ${!alertItem.read ? '<span class="badge bg-primary">New</span>' : ''}
                    ${isDeadlineReminder ? '<span class="badge bg-danger">마감일</span>' : ''}
                    ${isProjectInvited ? '<span class="badge bg-info">초대</span>' : ''}
                    ${isProjectInvited ? `
                        <div class="invitation-actions" style="display: none;">
                            <button class="btn btn-sm btn-success accept-invite" data-project-id="${alertItem.project_id}">수락</button>
                            <button class="btn btn-sm btn-danger decline-invite" data-project-id="${alertItem.project_id}">거절</button>
                        </div>
                    ` : `
                        <button class="btn btn-sm btn-outline-danger delete-notification" data-notification-id="${alertItem.id}">
                            <i class="bi bi-trash"></i>
                        </button>
                    `}
                </div>
            </div>
        `;
        
        // 마감일 알림 클릭 시 해당 프로젝트로 이동
        if (isDeadlineReminder && alertItem.project_id) {
            alertElement.style.cursor = 'pointer';
            alertElement.addEventListener('click', function(e) {
                if (e.target.closest('.delete-notification')) {
                    return; // 삭제 버튼 클릭 시에는 프로젝트 이동하지 않음
                }
                
                // 프로젝트 보드 모달 열기
                const projectCard = document.querySelector(`.project-card-wrapper[data-project-id="${alertItem.project_id}"]`);
                if (projectCard) {
                    projectCard.click();
                } else {
                    console.log('프로젝트 카드를 찾을 수 없습니다:', alertItem.project_id);
                }
            });
        }
        
        // 프로젝트 초대 알림 클릭 시 수락/거절 버튼 토글
        if (isProjectInvited) {
            alertElement.addEventListener('click', function(event) {
                if (event.target.closest('.accept-invite') || 
                    event.target.closest('.decline-invite') ||
                    event.target.closest('.delete-notification')) {
                    return;
                }
                const actionsDiv = this.querySelector('.invitation-actions');
                if (actionsDiv) {
                    actionsDiv.style.display = actionsDiv.style.display === 'none' ? 'block' : 'none';
                }
            });

            // 수락/거절 버튼 이벤트 핸들러 추가
            setTimeout(() => {
                const acceptBtn = alertElement.querySelector('.accept-invite');
                const declineBtn = alertElement.querySelector('.decline-invite');
                
                if (acceptBtn) {
                    acceptBtn.addEventListener('click', handleInvitationResponse);
                }
                if (declineBtn) {
                    declineBtn.addEventListener('click', handleInvitationResponse);
                }
            }, 100);
        }
        
        if (!alertItem.read) {
            unreadCount++;
            updateBadge();
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
        if (unreadCount > 0) { // 읽지 않은 알림이 있을 때만 처리
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
        
        // 이미 존재하는 알림인지 확인
        const existingNotification = notificationsList.querySelector(`[data-alert-id="${notification.id}"]`);
        if (!existingNotification) {
            addAlert(notification);
            console.log(`새 알림 추가됨: ${notification.message}`);
        } else {
            console.log(`이미 존재하는 알림: ${notification.message}`);
        }
    });

    // 프로젝트 초대 이벤트 수신 (더 이상 사용하지 않음 - notification 이벤트로 통합됨)
    window.socket.on("invite_project", data => {
        console.log("초대 이벤트 수신:", data);
        // 이 이벤트는 더 이상 사용하지 않음 - notification 이벤트로 통합됨
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
        // 초대 응답 후 알림창 다시 로드하지 않음
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

        // Socket.IO를 통해 알림 요청
        window.socket.emit('get_notifications');
        console.log('get_notifications 이벤트 전송됨');

        updateBadge(); 
        attachInvitationButtonHandlers(); 
    }

    // 서버로부터 저장된 알림 목록 수신 (regular notifications)
    window.socket.on('notifications_loaded', function(data) {
        console.log('저장된 알림 수신:', data);
        
        if (data.error) {
            console.error('알림 로딩 오류:', data.error);
            return;
        }
        
        // 기존 알림들을 제거하고 새로 로드
        notificationsList.innerHTML = '';
        unreadCount = 0;
        
        if (data.notifications && data.notifications.length > 0) {
            data.notifications.forEach(notification => {
                addAlert(notification);
            });
            console.log(`총 ${data.notifications.length}개의 알림 로드됨, 읽지 않은 알림: ${unreadCount}개`);
        } else {
            console.log('로드된 알림이 없습니다.');
        }
        
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
                    // 초대 수락/거절 후 알림창 다시 로드하지 않음
                    // 또한, DB에서 해당 알림을 삭제하도록 서버에 요청
                    const notificationToDeleteId = invitationItem.dataset.alertId;
                    console.log("초대 알림 삭제 요청: ID", notificationToDeleteId);
                    window.socket.emit('delete_notification', { notification_id: notificationToDeleteId });
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
    function initializeNotifications() {
        console.log('알림 시스템 초기화 시작');
        
        // Socket.IO 연결 확인
        if (window.socket && window.socket.connected) {
            console.log('Socket.IO 연결됨, 알림 로드 시작');
            loadNotificationsAndInvitations();
        } else {
            console.log('Socket.IO 연결 대기 중...');
            // Socket.IO 연결 이벤트를 기다림
            window.socket.on('connect', function() {
                console.log('Socket.IO 연결됨, 알림 로드 시작');
                loadNotificationsAndInvitations();
            });
        }
    }

    // 페이지 로드 완료 후 알림 시스템 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeNotifications);
    } else {
        initializeNotifications();
    }
}); 