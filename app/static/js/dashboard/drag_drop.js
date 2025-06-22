let dragged = null;
let dragClone = null;
let dragTimer = null;
let isDragging = false; // 프로젝트 카드 드래그 플래그 (project-card-wrapper)
let wasDragging = false; 
let startX = 0;
let startY = 0;
let scrollAnimationFrame = null; // 프로젝트 드래그 스크롤 애니메이션

let draggedCard = null;
let cardDragTimer = null;
let isCardDragging = false; // 작업 카드 드래그 플래그 (task-card)
let cardDragClone = null;
let cardAnimationFrameId = null; // 작업 카드 드래그 관련 requestAnimationFrame ID
let cardStartX = 0;
let cardStartY = 0;

// 현재 마우스/터치 좌표를 저장할 변수
let currentClientX = 0;
let currentClientY = 0;

// --- 추가된 스크롤 관련 변수 ---
let isSwiping = false; // 스와이프 중인지 여부 (일반 스크롤)
let lastClientX = 0; // 스와이프 스크롤을 위한 마지막 터치 X 좌표

function initializeDragAndDrop() {
    const projectScrollContainer = document.querySelector(".project-scroll-container");
    
    if (!projectScrollContainer) {
        console.error("Error: .project-scroll-container not found. Drag and drop features may not initialize.");
        return; 
    }

    // --- 휠 스크롤 로직 ---
    projectScrollContainer.addEventListener("wheel", e => {
        if (!isDragging && !isCardDragging) { // 드래그 중이 아닐 때만 휠 스크롤 허용
            e.preventDefault();
            projectScrollContainer.scrollLeft += e.deltaY * 0.5;
        }
    });

    // --- 프로젝트 카드 드래그 앤 드롭 로직 (project-card-wrapper) ---
    // 마우스 이벤트
    projectScrollContainer.addEventListener('mousedown', e => {
        const cardWrapper = e.target.closest('.project-card-wrapper');
        // task-card 내부의 클릭은 프로젝트 드래그로 취급하지 않음
        // isCardDragging은 task-card 드래그 중인지 판단
        if (!cardWrapper || e.target.closest('.task-card') || isCardDragging) return; 

        e.preventDefault(); // 드래그 대기 시간 동안 브라우저 기본 동작 방지
        e.stopPropagation();

        startX = e.clientX;
        startY = e.clientY;

        dragTimer = setTimeout(() => {
            startProjectDrag(cardWrapper, e.clientX, e.clientY);
        }, 200);
    });

    projectScrollContainer.addEventListener('mousemove', e => {
        if (isDragging && dragged) { // 프로젝트 카드 드래그 중
            e.preventDefault();
            handleProjectDrag(e.clientX, e.clientY);
        } else if (dragTimer) { // 드래그 타이머가 설정된 상태에서 움직임이 감지되면 타이머 취소
            const dx = Math.abs(e.clientX - startX);
            const dy = Math.abs(e.clientY - startY);
            if (dx > 5 || dy > 5) { // 미세한 움직임에도 타이머 취소 (클릭으로 간주)
                clearTimeout(dragTimer);
                dragTimer = null;
            }
        }
    });

    document.addEventListener('mouseup', () => {
        clearTimeout(dragTimer);
        if (isDragging) {
            endProjectDrag();
        }
    });

    projectScrollContainer.addEventListener('mouseleave', () => { // container를 벗어나면 타이머 취소
        clearTimeout(dragTimer);
    });

    // 터치 이벤트 (수정)
    projectScrollContainer.addEventListener('touchstart', e => {
        const cardWrapper = e.target.closest('.project-card-wrapper');
        // 작업 카드 내부 요소 클릭 또는 작업 카드 드래그 중에는 프로젝트 드래그 또는 스크롤 시작 안함
        if (e.target.closest('.task-card') || isCardDragging) {
            return; 
        }

        const touch = e.touches[0];
        startX = touch.clientX; // 프로젝트 드래그 시작 X 좌표 (드래그 판별용)
        startY = touch.clientY; // 프로젝트 드래그 시작 Y 좌표 (드래그 판별용)
        lastClientX = touch.clientX; // 일반 스와이프 스크롤을 위한 시작 X 좌표

        // 드래그 타이머 설정
        dragTimer = setTimeout(() => {
            // 스와이프 중이 아닐 때만 프로젝트 드래그 시작
            if (!isSwiping) { 
                startProjectDrag(cardWrapper, touch.clientX, touch.clientY);
            }
        }, 300); // 길게 누르기(드래그) 시작 지연 시간

        // passive: false를 유지하여 e.preventDefault()를 조건부로 사용
        e.stopPropagation(); // 이벤트 버블링 방지
    }, { passive: false });

    projectScrollContainer.addEventListener('touchmove', e => {
        if (isDragging && dragged) { // 프로젝트 카드 드래그 중
            e.preventDefault(); // 브라우저 기본 스크롤 동작 방지
            const touch = e.touches[0];
            handleProjectDrag(touch.clientX, touch.clientY);
            wasDragging = true; // 드래그가 발생했음을 표시
        } else if (dragTimer) { // 드래그 타이머 대기 중
            const touch = e.touches[0];
            const dx = Math.abs(touch.clientX - startX);
            const dy = Math.abs(touch.clientY - startY);

            // 드래그 임계값을 넘으면 타이머 취소 (클릭이 아님)
            // 그리고 움직임이 크면 일반 스와이프 스크롤로 간주
            if (dx > 15 || dy > 15) { // 터치 임계값: 일정 거리 이상 움직이면 스크롤 또는 드래그 시작
                clearTimeout(dragTimer);
                dragTimer = null;
                
                // 수평 이동이 수직 이동보다 크면 스와이프로 간주하여 가로 스크롤 시작
                if (dx > dy) {
                    isSwiping = true; // 스와이프 시작
                    e.preventDefault(); // 스와이프 스크롤 시 브라우저 기본 동작 방지
                    projectScrollContainer.scrollLeft -= (touch.clientX - lastClientX);
                    lastClientX = touch.clientX;
                }
            }
        } else if (isSwiping) { // 일반 스와이프 스크롤 중
            e.preventDefault(); // 스와이프 스크롤 시 브라우저 기본 동작 방지
            const touch = e.touches[0];
            projectScrollContainer.scrollLeft -= (touch.clientX - lastClientX);
            lastClientX = touch.clientX;
        }
    }, { passive: false });

    document.addEventListener('touchend', () => {
        clearTimeout(dragTimer);
        if (isDragging) { // 프로젝트 카드 드래그 종료
            endProjectDrag();
        }
        isSwiping = false; // 스와이프 상태 초기화
        setTimeout(() => { wasDragging = false; }, 100); // 클릭 이벤트와 분리 (드래그 종료 후 짧은 시간 동안 클릭 방지)
    });

    // Project Drag Functions 
    function startProjectDrag(card, x, y) {
        if (isDragging || isSwiping) return; // 드래그 또는 스와이프 중이면 시작 안함
        isDragging = true;
        wasDragging = true; // 드래그가 발생했음을 표시
        dragged = card;

        card.classList.add("dragging"); // 원본 카드에 드래그 클래스 추가
        dragClone = card.cloneNode(true); // 클론 생성
        dragClone.classList.add("drag-clone");
        dragClone.style.width = `${card.offsetWidth}px`;
        dragClone.style.height = `${card.offsetHeight}px`;
        dragClone.style.position = 'fixed';
        dragClone.style.pointerEvents = 'none'; // 클론이 이벤트 가로채지 않도록
        dragClone.style.zIndex = '1000';
        // transform 사용
        dragClone.style.transform = `translate(${x - card.offsetWidth / 2}px, ${y - card.offsetHeight / 2}px)`;
        document.body.appendChild(dragClone);
    }

    function handleProjectDrag(x, y) {
        if (!dragClone || !dragged) return;

        // transform 사용
        dragClone.style.transform = `translate(${x - dragged.offsetWidth / 2}px, ${y - dragged.offsetHeight / 2}px)`;

        const containerRect = projectScrollContainer.getBoundingClientRect(); 
        const scrollSpeed = 20;
        const edgeThreshold = 50;

        if (scrollAnimationFrame) cancelAnimationFrame(scrollAnimationFrame);

        scrollAnimationFrame = requestAnimationFrame(function scrollStep() {
            if (!isDragging) return;

            if (x < containerRect.left + edgeThreshold) {
                projectScrollContainer.scrollLeft -= scrollSpeed;
            } else if (x > containerRect.right - edgeThreshold) {
                projectScrollContainer.scrollLeft += scrollSpeed;
            }

            const target = document.elementFromPoint(x, y);
            const targetCard = target?.closest(".project-card-wrapper");
            if (targetCard && targetCard !== dragged && !targetCard.classList.contains("drag-clone")) {
                const cardRect = targetCard.getBoundingClientRect();
                const insertBeforeTarget = x < cardRect.left + cardRect.width / 2;

                if (insertBeforeTarget) {
                    projectScrollContainer.insertBefore(dragged, targetCard);
                } else {
                    projectScrollContainer.insertBefore(dragged, targetCard.nextSibling);
                }
            }
            if (isDragging) scrollAnimationFrame = requestAnimationFrame(scrollStep);
        });
    }

    function endProjectDrag() {
        if (!isDragging || !dragged) return;
        isDragging = false;
        dragged.classList.remove("dragging");

        if (dragClone) {
            dragClone.remove();
            dragClone = null;
        }

        saveProjectOrder();
        dragged = null;

        if (scrollAnimationFrame) {
            cancelAnimationFrame(scrollAnimationFrame);
            scrollAnimationFrame = null;
        }
        setTimeout(() => { wasDragging = false; }, 100); 
    }

    async function saveProjectOrder() {
        const order = Array.from(projectScrollContainer.querySelectorAll(".project-card-wrapper"))
            .map(card => card.getAttribute("data-project-id"));
        localStorage.setItem("projectOrder", JSON.stringify(order));
        try {
            const response = await fetch("/projects/reorder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ order })
            });
            if (!response.ok) console.error("프로젝트 순서 저장 실패:", response.status);
        } catch (err) {
            console.error("순서 저장 중 오류:", err);
        }
    }


    // --- 작업 카드 드래그 앤 드롭 로직 (task-card) ---
    // 마우스 이벤트
    projectScrollContainer.addEventListener('mousedown', e => { 
        const taskCard = e.target.closest('.task-card');
        if (!taskCard || isDragging || isCardDragging) return; 

        e.preventDefault(); 
        e.stopPropagation(); // 이 시점에서 이벤트를 중단하여 프로젝트 드래그 이벤트로 전파 방지

        cardStartX = e.clientX;
        cardStartY = e.clientY;

        cardDragTimer = setTimeout(() => {
            startCardDrag(taskCard, e.clientX, e.clientY);
        }, 150); // 카드 드래그 시작 지연 시간
    });

    projectScrollContainer.addEventListener('mousemove', e => { 
        if (isCardDragging && draggedCard) {
            e.preventDefault();
            // 좌표만 업데이트하고 실제 DOM 조작은 requestAnimationFrame에서
            currentClientX = e.clientX;
            currentClientY = e.clientY;
        } else if (cardDragTimer) {
            const dx = Math.abs(e.clientX - cardStartX);
            const dy = Math.abs(e.clientY - cardStartY);
            if (dx > 10 || dy > 10) { // 마우스 카드 드래그 임계값
                clearTimeout(cardDragTimer);
                cardDragTimer = null;
            }
        }
    });

    document.addEventListener('mouseup', () => { 
        clearTimeout(cardDragTimer);
        if (isCardDragging) {
            endCardDrag();
        }
    });

    // 터치 이벤트
    projectScrollContainer.addEventListener('touchstart', e => { 
        const taskCard = e.target.closest('.task-card');
        // 프로젝트 드래그 중이거나 이미 카드 드래그 중이면 시작 안함
        if (!taskCard || isDragging || isCardDragging) return; 

        e.preventDefault(); 
        e.stopPropagation();

        const touch = e.touches[0];
        cardStartX = touch.clientX;
        cardStartY = touch.clientY;

        cardDragTimer = setTimeout(() => {
            startCardDrag(taskCard, touch.clientX, touch.clientY);
        }, 300); // 카드 드래그 시작 지연 시간 (길게 누르기)
    }, { passive: false }); 

    projectScrollContainer.addEventListener('touchmove', e => { 
        if (isCardDragging && draggedCard) {
            e.preventDefault();
            const touch = e.touches[0];
            // 좌표만 업데이트하고 실제 DOM 조작은 requestAnimationFrame에서
            currentClientX = touch.clientX;
            currentClientY = touch.clientY;
        } else if (cardDragTimer) {
            const touch = e.touches[0];
            const dx = Math.abs(touch.clientX - cardStartX);
            const dy = Math.abs(touch.clientY - cardStartY);
            if (dx > 20 || dy > 20) { // 터치 카드 드래그 임계값 (더 여유롭게)
                clearTimeout(cardDragTimer);
                cardDragTimer = null;
            }
        }
    }, { passive: false });

    document.addEventListener('touchend', () => { 
        clearTimeout(cardDragTimer);
        if (isCardDragging) {
            endCardDrag();
        }
    });

    // 카드 드래그 관련 함수
    function startCardDrag(card, x, y) {
        if (isCardDragging || isDragging) return; // 프로젝트 드래그와 동시 실행 방지
        isCardDragging = true;
        draggedCard = card;

        // 1. 원본 카드를 플레이스홀더로 활용 (opacity 및 pointer-events)
        draggedCard.style.opacity = '0.3'; // 반투명하게 만듦
        draggedCard.style.pointerEvents = 'none'; // 원본 카드가 이벤트 가로채지 않도록

        // 2. 드래그 클론 생성 및 스타일 설정 (transform 사용)
        cardDragClone = card.cloneNode(true); 
        cardDragClone.classList.add("drag-clone");
        cardDragClone.style.width = `${card.offsetWidth}px`;
        cardDragClone.style.height = `${card.offsetHeight}px`;
        cardDragClone.style.position = 'fixed';
        cardDragClone.style.pointerEvents = 'none'; 
        cardDragClone.style.zIndex = '1000';
        cardDragClone.style.transform = `translate(${x - card.offsetWidth / 2}px, ${y - card.offsetHeight / 2}px)`;
        document.body.appendChild(cardDragClone);
        
        // requestAnimationFrame 루프 시작
        currentClientX = x; // 초기 좌표 설정
        currentClientY = y;
        if (!cardAnimationFrameId) { // 이미 애니메이션이 돌고 있지 않다면 시작
            cardAnimationFrameId = requestAnimationFrame(updateCardPositionAndScroll);
        }
    }

    // 새로운 requestAnimationFrame 콜백 함수
    function updateCardPositionAndScroll() {
        if (!isCardDragging || !cardDragClone || !draggedCard) {
            cardAnimationFrameId = null; // 드래그가 끝나면 요청 중지
            return;
        }

        // 1. 카드 클론 위치 업데이트 (currentClientX, currentClientY 사용, transform)
        cardDragClone.style.transform = `translate(${currentClientX - draggedCard.offsetWidth / 2}px, ${currentClientY - draggedCard.offsetHeight / 2}px)`;

        // 2. 자동 스크롤 로직
        const projectContainerRect = projectScrollContainer.getBoundingClientRect();
        const scrollSpeed = 20;
        const edgeThreshold = 100;

        // 가로 스크롤 (projectScrollContainer)
        if (currentClientX < projectContainerRect.left + edgeThreshold) {
            projectScrollContainer.scrollLeft -= scrollSpeed;
        } else if (currentClientX > projectContainerRect.right - edgeThreshold) {
            projectScrollContainer.scrollLeft += scrollSpeed;
        }

        // 세로 스크롤 (현재 드롭 가능한 .card-container)
        // draggedCard가 pointer-events: none이므로, elementFromPoint는 뒤에 있는 요소를 잡음
        const targetElementAtPoint = document.elementFromPoint(currentClientX, currentClientY);
        const currentCardContainer = targetElementAtPoint?.closest('.card-container');
        
        if (currentCardContainer) {
            const containerRect = currentCardContainer.getBoundingClientRect();
            const isScrollableVertically = currentCardContainer.scrollHeight > currentCardContainer.clientHeight;

            if (isScrollableVertically) {
                if (currentClientY < containerRect.top + edgeThreshold) {
                    currentCardContainer.scrollTop -= scrollSpeed;
                } else if (currentClientY > containerRect.bottom - edgeThreshold) {
                    currentCardContainer.scrollTop += scrollSpeed;
                }
            }
        }

        // 3. 원본 카드(플레이스홀더 역할)의 위치 업데이트 로직
        const target = document.elementFromPoint(currentClientX, currentClientY);
        let targetContainer = target?.closest('.card-container');
        
        // 모든 드롭 영역 하이라이트 제거
        document.querySelectorAll('.card-container').forEach(c => {
            c.classList.remove('drag-over'); 
        });

        if (targetContainer) {
            targetContainer.classList.add('drag-over');

            const cardsInTarget = [...targetContainer.querySelectorAll('.task-card')]
                .filter(card => card !== draggedCard); // 드래그 중인 원본 카드는 제외
            
            const dropY = currentClientY; 
            let closestCard = null;
            let minOffset = Number.POSITIVE_INFINITY;

            for (const card of cardsInTarget) {
                const box = card.getBoundingClientRect();
                const offset = dropY - (box.top + box.height / 2);
                if (offset < 0 && offset > -minOffset) {
                    minOffset = -offset;
                    closestCard = card;
                }
            }

            // 원본 카드(플레이스홀더 역할)를 새로운 위치로 이동
            if (draggedCard.parentNode !== targetContainer) {
                if (draggedCard.parentNode) {
                    draggedCard.parentNode.removeChild(draggedCard);
                }
            }

            if (closestCard) {
                targetContainer.insertBefore(draggedCard, closestCard);
            } else {
                targetContainer.appendChild(draggedCard);
            }
        }

        // 다음 애니메이션 프레임 요청
        cardAnimationFrameId = requestAnimationFrame(updateCardPositionAndScroll);
    }

    async function endCardDrag() {
        if (!isCardDragging || !draggedCard) return;

        isCardDragging = false;
        clearTimeout(cardDragTimer);

        if (cardAnimationFrameId) {
            cancelAnimationFrame(cardAnimationFrameId); // 애니메이션 프레임 요청 중지
            cardAnimationFrameId = null;
        }

        // 드롭 시 원본 카드의 스타일 복원
        draggedCard.style.opacity = ''; // opacity 초기화
        draggedCard.style.pointerEvents = ''; // pointer-events 초기화
        draggedCard.classList.remove('dragging'); // 드래그 중 클래스 제거

        // 클론 제거
        if (cardDragClone) {
            cardDragClone.remove();
            cardDragClone = null;
        }
        
        // 하이라이트 제거
        document.querySelectorAll('.card-container').forEach(c => c.classList.remove('drag-over'));

        // 데이터 업데이트 로직 (원본 카드 위치는 이미 updateCardPositionAndScroll에서 반영됨)
        const targetContainer = draggedCard.parentNode; // 현재 draggedCard의 최종 부모 컨테이너
        if (targetContainer && targetContainer.classList.contains('card-container')) { // 유효한 컨테이너에 드롭된 경우
            const cardId = draggedCard.dataset.cardId;
            const targetProjectId = targetContainer.dataset.projectId; 

            if (cardId && targetProjectId) {
                await updateCardProjectAndOrder(cardId, targetProjectId, targetContainer);
            } else {
                console.error('카드 ID 또는 대상 프로젝트 ID가 누락되었습니다.');
            }
        } else {
            console.warn('카드가 유효한 드롭 컨테이너에 드롭되지 않았습니다. 원본 카드를 원래 위치로 되돌리거나, 적절히 처리해야 합니다.');
        }

        draggedCard = null; // 드래그된 카드 참조 해제
    }

    async function updateCardProjectAndOrder(cardId, targetProjectId, container) {
        const cards = [...container.querySelectorAll('.task-card')];
        const order = cards.map(card => card.dataset.cardId);

        try {
            const sourceProjectId = draggedCard?.dataset.projectId;
            if (!sourceProjectId) throw new Error('드래그된 카드에서 원본 프로젝트 ID를 찾을 수 없습니다.');
            if (!cardId || !targetProjectId) throw new Error('카드 ID 또는 대상 프로젝트 ID가 누락되었습니다.');

            const payload = { cardId, projectId: targetProjectId, sourceProjectId, order };
            const response = await fetch(`/projects/${sourceProjectId}/cards/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            // 소켓 통신을 통해 다른 클라이언트에게 카드 이동 알림
            socket.emit('card_moved', { card_id: cardId, source_project_id: sourceProjectId, target_project_id: targetProjectId, order });

            let errorData = null;
            try { errorData = await response.json(); } catch (e) {
                console.error('서버 응답 파싱 실패:', await response.text());
                errorData = { message: '서버 응답을 파싱할 수 없습니다.' };
            }

            if (!response.ok) {
                console.error(`카드 이동/순서 업데이트 실패: ${errorData.message}`, errorData);
                alert(errorData.message || '카드 이동/순서 업데이트에 실패했습니다.');
                return;
            }

            // 성공적으로 이동했으면, draggedCard의 projectId 데이터 속성을 업데이트
            if (draggedCard) draggedCard.dataset.projectId = targetProjectId;
            
            // 관련 프로젝트의 히스토리와 카드 다시 로드
            await loadHistory(sourceProjectId);
            if (sourceProjectId !== targetProjectId) { // 프로젝트가 변경되었을 경우에만 대상 프로젝트 히스토리 로드
                await loadHistory(targetProjectId);
            }
            loadCards(); // 모든 카드 다시 로드 (확실성을 위해)
        } catch (error) {
            console.error('카드 업데이트 중 오류 발생:', error.message);
            alert('카드 이동/순서 업데이트 중 오류가 발생했습니다: ' + error.message);
        }
    }
}

socket.on("card_moved", data => {
    const { source_project_id, target_project_id } = data;
    const currentProjectIds = getVisibleProjectIds();

    // 소스 프로젝트에 현재 표시된 카드가 있다면 다시 로드
    if (currentProjectIds.includes(source_project_id)) {
        loadCards(source_project_id);
    }
    // 대상 프로젝트에 현재 표시된 카드가 있다면 다시 로드
    if (currentProjectIds.includes(target_project_id)) {
        loadCards(target_project_id);
    }
});

function getVisibleProjectIds() {
    return Array.from(document.querySelectorAll(".card-container"))
        .map(el => el.dataset.projectId);
}
