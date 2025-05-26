document.addEventListener("DOMContentLoaded", function () {
  const toggle = document.getElementById("history-toggle");
  const list = document.getElementById("history-list");
  const arrow = document.getElementById("history-arrow");

  toggle.addEventListener("click", function () {
    list.classList.toggle("open");
    arrow.classList.toggle("bi-caret-right-fill");
    arrow.classList.toggle("bi-caret-down-fill");
  });
});

async function loadHistory(projectId) {
  try {
    const loading = document.getElementById("history-loading");
    const historyList = document.getElementById("history-list");
    const arrow = document.getElementById("history-arrow");

    loading.style.display = "block";
    historyList.innerHTML = "";
    historyList.classList.remove("open");
    arrow.classList.remove("bi-caret-down-fill");
    arrow.classList.add("bi-caret-right-fill");

    const response = await fetch(`/history/${projectId}`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include"
    });
    loading.style.display = "none";

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (!data.history || !Array.isArray(data.history) || data.history.length === 0) {
      const li = document.createElement("li");
      li.textContent = "히스토리가 없습니다.";
      historyList.appendChild(li);
      return;
    }

    data.history.forEach(entry => {
      const li = document.createElement("li");
      let detailText = "";
      
      // 상태 수정과 설명 수정 여부를 확인
      const isStatusUpdate = entry.action === "card_status_update";
      const isCardUpdate = entry.action === "card_update";
      let shouldDisplay = true;

      if (isCardUpdate) {
        // description이 포함된 경우 표시
        const hasDescription = entry.details.description;
        console.log("Card update details:", entry.details, "hasDescription:", hasDescription); // 디버깅 로그
        shouldDisplay = hasDescription; // description이 있으면 항상 표시
      }

      if (shouldDisplay) {
        switch (entry.action) {
          case "create":
            detailText = entry.details.project_name 
              ? `프로젝트 생성: ${entry.details.project_name}`
              : `알 수 없는 프로젝트 생성`;
            break;
          case "join":
            detailText = entry.details.project_name 
              ? `프로젝트 참여: ${entry.details.project_name}`
              : `알 수 없는 프로젝트 참여`;
            break;
          case "leave":
            detailText = entry.details.project_name 
              ? `프로젝트 떠남: ${entry.details.project_name}`
              : `알 수 없는 프로젝트 떠남`;
            break;
          case "card_create":
            detailText = entry.details.title 
              ? `카드 생성: ${entry.details.title}${entry.details.status ? ` (상태: ${entry.details.status})` : ''}`
              : `알 수 없는 카드 생성`;
            break;
          case "card_delete":
            detailText = entry.details.title 
              ? `카드 삭제: ${entry.details.title}`
              : `알 수 없는 카드 삭제`;
            break;
          case "card_move_in":
          case "card_move_out":
            detailText = entry.details.title 
              ? `카드 이동: ${entry.details.title}, ${entry.details.from_project || '알 수 없음'} -> ${entry.details.to_project || '알 수 없음'}`
              : `알 수 없는 카드 이동`;
            break;
          case "card_status_update":
            detailText = entry.details.title 
              ? `상태 변경: ${entry.details.from_status || '없음'} -> ${entry.details.to_status || '없음'} (${entry.details.title})`
              : `알 수 없는 상태 변경`;
            break;
          case "card_reorder":
            detailText = entry.details.title 
              ? `카드 순서 변경: ${entry.details.title} (새 순서: ${entry.details.new_order || '알 수 없음'})`
              : `알 수 없는 순서 변경`;
            break;
          case "card_update":
            detailText = entry.details.description 
              ? `카드 설명 수정: ${entry.details.description.from || '없음'} -> ${entry.details.description.to || '없음'}`
              : `알 수 없는 카드 수정`;
            break;
          default:
            detailText = `알 수 없는 작업: ${JSON.stringify(entry.details)}`;
        }
        li.textContent = `${entry.created_at} ${entry.user}: ${detailText}`;
        historyList.appendChild(li);
      }
    });

    // 히스토리 있으면 자동 펼침
    if (historyList.children.length > 0) {
      historyList.classList.add("open");
      arrow.classList.remove("bi-caret-right-fill");
      arrow.classList.add("bi-caret-down-fill");
    }

  } catch (error) {
    console.error("Failed to load history:", error);
    document.getElementById("history-loading").style.display = "none";
    historyList.innerHTML = "";
    const li = document.createElement("li");
    li.textContent = "히스토리를 불러오는 데 실패했습니다.";
    historyList.appendChild(li);
  }
}