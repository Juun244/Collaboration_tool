let isProjectsInitialized = false;

function initializeProjects() {
  if (isProjectsInitialized) {
    console.log("프로젝트가 이미 초기화되어 있습니다.");
    return;
  }

  // 프로젝트 삭제/나가기
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
            alert(`프로젝트가 ${action}되었습니다.`);
            window.location.reload();
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

  // 프로젝트 순서 로드
  async function loadProjectOrder() {
    try {
      const response = await fetch("/projects/order");
      if (response.ok) {
        const data = await response.json();
        const order = data.order;
        const container = document.querySelector(".project-scroll-container");
        const cards = Array.from(container.querySelectorAll(".project-card-wrapper"));
        order.forEach(projectId => {
          const card = cards.find(c => c.dataset.projectId === projectId);
          if (card) {
            container.appendChild(card);
          }
        });
      }
    } catch (err) {
      console.error("Load project order error:", err);
    }
  }

  loadProjectOrder();

  isProjectsInitialized = true;
  console.log("프로젝트 초기화가 완료되었습니다.");
}

const currentUser = window.currentUser || { id: "", username: "" };

function loadComments(projectId) {
  fetch(`/projects/${projectId}/comments`)
    .then(res => res.json())
    .then(data => {
      const list = document.getElementById("comment-list");
      list.innerHTML = "";
      data.comments.forEach(comment => {
        const isMine = comment.author_id === currentUser.id;
        list.innerHTML += `
          <div class="comment mb-2" data-id="${comment._id}">
            <b>${comment.author_name}</b>
            <span style="color:gray; font-size:small;">${comment.created_at}</span><br>
            <span class="comment-content">${comment.content}</span>
            ${isMine ? `
              <button class="btn btn-sm btn-outline-secondary edit-comment-btn">수정</button>
              <button class="btn btn-sm btn-outline-danger delete-comment-btn">삭제</button>
            ` : ""}
          </div>
        `;
      });

      // 수정/삭제 이벤트 등록
      list.querySelectorAll('.edit-comment-btn').forEach(btn => {
        btn.onclick = function() {
          const commentDiv = btn.closest('.comment');
          const commentId = commentDiv.dataset.id;
          const contentSpan = commentDiv.querySelector('.comment-content');
          const oldContent = contentSpan.textContent;
          const newContent = prompt("댓글 수정", oldContent);
          if (newContent && newContent !== oldContent) {
            fetch(`/comments/${commentId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: newContent })
            }).then(() => loadComments(projectId));
          }
        };
      });
      list.querySelectorAll('.delete-comment-btn').forEach(btn => {
        btn.onclick = function() {
          const commentDiv = btn.closest('.comment');
          const commentId = commentDiv.dataset.id;
          if (confirm("정말 삭제할까요?")) {
            fetch(`/comments/${commentId}`, { method: "DELETE" })
              .then(() => loadComments(projectId));
          }
        };
      });
    });
}

document.getElementById('add-comment-btn').onclick = function() {
  const content = document.getElementById('new-comment-content').value.trim();
  // 모달 열 때 data-project-id 속성에 프로젝트 ID를 반드시 넣어줘야 함
  const projectId = document.getElementById('projectBoardModal').dataset.projectId;
  if (!content) return;
  fetch(`/projects/${projectId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  }).then(() => {
    document.getElementById('new-comment-content').value = "";
    loadComments(projectId);
  });
};

// 모달이 열릴 때 마다 댓글 불러오기
document.getElementById('projectBoardModal').addEventListener('show.bs.modal', function(event) {
  const projectId = this.dataset.projectId;
  loadComments(projectId);
  document.getElementById('add-comment-btn').onclick = function() {
    const content = document.getElementById('new-comment-content').value.trim();
    if (!content) return;
    fetch(`/projects/${projectId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    }).then(() => {
      document.getElementById('new-comment-content').value = "";
      loadComments(projectId);
    });
  };
});


