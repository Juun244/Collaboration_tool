const socket = io();
// WebSocket 이벤트 리스너 설정
socket.on('user_joined', function(data) {
    console.log('User joined project:', data);
    loadProjectListAndMembers(); // 멤버 목록 갱신
    updateProjectMemberCount(data.project_id, data.member_count); // 멤버 수 UI 업데이트
});

socket.on('user_left', function(data) {
    console.log('User left project:', data);
    loadProjectListAndMembers(); // 멤버 목록 갱신
    updateProjectMemberCount(data.project_id, data.member_count); // 멤버 수 UI 업데이트
    alert(`사용자 ${data.user_id}가 프로젝트에서 나갔습니다.`);
});

socket.on('card_created', function(data) {
    console.log('Card created:', data);
    addCardToBoard(data); // 카드 추가 UI 업데이트
});

socket.on('card_updated', function(data) {
    console.log('Card updated:', data);
    updateCardOnBoard(data); // 카드 수정 UI 업데이트
});

socket.on('card_deleted', function(data) {
    console.log('Card deleted:', data);
    removeCardFromBoard(data); // 카드 삭제 UI 업데이트
});

socket.on('card_moved', function(data) {
    console.log('Card moved:', data);
    moveCardOnBoard(data); // 카드 이동 UI 업데이트
});

// 프로젝트 멤버 변경 이벤트 수신 (기존 로직 유지)
socket.on('project_member_updated', function(data) {
    console.log('Project member updated:', data);
    updateProjectMemberCount(data.project_id, data.member_count);
    if (data.action === 'leave') {
        alert(`'${data.project_name}' 프로젝트에서 멤버가 나갔습니다.`);
        loadProjectListAndMembers(); // 멤버 변화 후 목록 갱신
    } else if (data.action === 'join') {
        loadProjectListAndMembers(); // 멤버 변화 후 목록 갱신
    } else if (data.action === 'delete') {
        alert(`'${data.project_name}' 프로젝트가 삭제되었습니다.`);
        loadProjectListAndMembers(); // 삭제 후 목록 갱신
    }
});

function initializeProjects() {
    // 프로젝트 삭제/나가기 (WebSocket 이벤트 발생)
    document.querySelectorAll(".delete-project, .leave-project").forEach(button => {
        button.addEventListener("click", async e => {
            e.stopPropagation();
            const projectId = button.dataset.projectId;
            const isOwner = button.classList.contains("delete-project");
            const action = isOwner ? "삭제" : "나가기";
            if (confirm(`이 프로젝트를 ${action}하시겠습니까?`)) {
                try {
                    const response = await fetch(`/projects/${projectId}`, {
                        method: "DELETE"
                    });
                    if (response.ok) {
                        console.log(`프로젝트가 ${action}되었습니다.`);
                        socket.emit('project_deleted_or_left', { projectId: projectId }); // WebSocket 이벤트 발생
                        socket.emit('leave_project', { project_id: projectId }); // socket.py의 leave_project 이벤트 호출
                        loadProjectListAndMembers(); // 삭제/나간 후 목록 갱신
                    } else {
                        const error = await response.json();
                        alert(error.message || `프로젝트 ${action} 실패`);
                    }
                } catch (err) {
                    console.error(`Project ${action} error:`, err);
                    alert("오류가 발생했습니다.");
                }
            }
        });
    });

    // 프로젝트 목록 및 멤버 수를 로드하는 함수
    async function loadProjectListAndMembers() {
        try {
            const response = await fetch("/api/projects"); // 프로젝트 목록 API
            if (response.ok) {
                const data = await response.json();
                const container = document.querySelector(".project-scroll-container");
                const existingCards = Array.from(container.querySelectorAll(".project-card-wrapper"));
                container.innerHTML = ''; // 기존 목록 비우기

                data.forEach(project => {
                    let card = existingCards.find(c => c.dataset.projectId === project.id);
                    if (!card) {
                        card = document.createElement('div');
                        card.className = 'project-card-wrapper';
                        card.dataset.projectId = project.id;
                    }
                    card.innerHTML = `
                        <div class="project-card">
                            <h5 class="project-name">${project.name}</h5>
                            <span class="member-count" data-project-id="${project.id}">멤버 수: ${project.members ? project.members.length : 0}</span>
                            <button class="btn btn-danger btn-sm delete-project" data-project-id="${project.id}">삭제</button>
                            <button class="btn btn-secondary btn-sm leave-project" data-project-id="${project.id}">나가기</button>
                        </div>
                    `;
                    container.appendChild(card);

                    // 이벤트 리스너 다시 연결
                    card.querySelectorAll(".delete-project, .leave-project").forEach(btn => {
                        btn.addEventListener("click", async e => {
                            e.stopPropagation();
                            const projectIdToDelete = e.target.dataset.projectId;
                            const isOwnerToDelete = e.target.classList.contains("delete-project");
                            const actionToDelete = isOwnerToDelete ? "삭제" : "나가기";
                            if (confirm(`이 프로젝트를 ${actionToDelete}하시겠습니까?`)) {
                                try {
                                    const responseDelete = await fetch(`/projects/${projectIdToDelete}`, { method: "DELETE" });
                                    if (responseDelete.ok) {
                                        console.log(`프로젝트가 ${actionToDelete}되었습니다.`);
                                        socket.emit('project_deleted_or_left', { projectId: projectIdToDelete });
                                        socket.emit('leave_project', { project_id: projectIdToDelete }); // socket.py 연동
                                        loadProjectListAndMembers(); // 목록 갱신
                                    } else {
                                        const errorDelete = await responseDelete.json();
                                        alert(errorDelete.message || `프로젝트 ${actionToDelete} 실패`);
                                    }
                                } catch (err) {
                                    console.error(`Project ${actionToDelete} error:`, err);
                                    alert("오류가 발생했습니다.");
                                }
                            }
                        });
                    });
                });
                loadProjectOrder(); // 로컬 순서 적용
            } else {
                console.error("Failed to load project list and members");
            }
        } catch (err) {
            console.error("Error loading project list and members:", err);
        }
    }

    // 로컬 스토리지에서 프로젝트 순서를 로드하고 적용
    function loadProjectOrder() {
        const order = localStorage.getItem('projectOrder');
        if (order) {
            const orderedProjectIds = JSON.parse(order);
            const container = document.querySelector(".project-scroll-container");
            const cards = Array.from(container.querySelectorAll(".project-card-wrapper"));
            container.innerHTML = '';
            orderedProjectIds.forEach(projectId => {
                const card = cards.find(c => c.dataset.projectId === projectId);
                if (card) {
                    container.appendChild(card);
                }
            });
        } else {
            // 로컬 순서가 없으면 기본 순서로 로드 (API 호출)
            fetch("/projects/order")
                .then(response => response.json())
                .then(data => {
                    const orderedProjectIds = data.order;
                    const container = document.querySelector(".project-scroll-container");
                    const cards = Array.from(container.querySelectorAll(".project-card-wrapper"));
                    container.innerHTML = '';
                    orderedProjectIds.forEach(projectId => {
                        const card = cards.find(c => c.dataset.projectId === projectId);
                        if (card) {
                            container.appendChild(card);
                        }
                    });
                })
                .catch(error => console.error("Error loading initial project order:", error));
        }
    }

    // 특정 프로젝트의 멤버 수 UI 업데이트
    function updateProjectMemberCount(projectId, memberCount) {
        const countSpan = document.querySelector(`.member-count[data-project-id="${projectId}"]`);
        if (countSpan) {
            countSpan.textContent = `멤버 수: ${memberCount || 0}`;
        }
    }

    // 카드 추가 (Placeholder: 실제 UI에 맞게 구현 필요)
    function addCardToBoard(data) {
        const board = document.querySelector(`.project-board[data-project-id="${data.project_id}"]`);
        if (board) {
            const card = document.createElement('div');
            card.className = 'card';
            card.dataset.cardId = data.card_id;
            card.innerHTML = `
                <h6>${data.card_title || 'New Card'}</h6>
                <p>${data.card_description || ''}</p>
            `;
            const column = board.querySelector(`.column[data-column-id="${data.column_id}"]`);
            if (column) {
                column.appendChild(card);
            }
        }
    }

    // 카드 수정 (Placeholder: 실제 UI에 맞게 구현 필요)
    function updateCardOnBoard(data) {
        const card = document.querySelector(`.card[data-card-id="${data.card_id}"]`);
        if (card) {
            card.querySelector('h6').textContent = data.card_title || 'Updated Card';
            card.querySelector('p').textContent = data.card_description || '';
        }
    }

    // 카드 삭제 (Placeholder: 실제 UI에 맞게 구현 필요)
    function removeCardFromBoard(data) {
        const card = document.querySelector(`.card[data-card-id="${data.card_id}"]`);
        if (card) {
            card.remove();
        }
    }

    // 카드 이동 (Placeholder: 실제 UI에 맞게 구현 필요)
    function moveCardOnBoard(data) {
        const card = document.querySelector(`.card[data-card-id="${data.card_id}"]`);
        const board = document.querySelector(`.project-board[data-project-id="${data.project_id}"]`);
        if (card && board) {
            const newColumn = board.querySelector(`.column[data-column-id="${data.column_id}"]`);
            if (newColumn) {
                newColumn.appendChild(card);
            }
        }
    }

    loadProjectListAndMembers();
}

document.addEventListener('DOMContentLoaded', initializeProjects);