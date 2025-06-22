let isProjectsInitialized = false;

window.initializeProjects = function() {
  if (isProjectsInitialized) {
    console.log("프로젝트가 이미 초기화되었습니다.");
    return;
  }

  console.log("initializeProjects 호출됨");

  socket.on("create_comment", data => {
    console.log('create_comment 이벤트 수신:', data);
    const currentProjectId = document.getElementById("projectBoardModal")?.dataset.projectId;
    if (data.project_id !== currentProjectId) {
      console.log('프로젝트 ID 불일치:', { received: data.project_id, current: currentProjectId });
      return;
    }

    const list = document.getElementById("comment-list");
    if (list) {
      const commentHTML = renderCommentHTML(data.comment);
      list.insertAdjacentHTML("beforeend", commentHTML);
      console.log('댓글 추가됨:', data.comment.id);
    }
  });

  socket.on('comment_deleted', data => {
    const div = document.querySelector(`.comment[data-id="${data.comment_id}"]`);
    if (div) div.remove();
  });

  socket.on('comment_edited', data => {
    console.log('comment_edited 이벤트 수신:', data);
    const currentProjectId = document.getElementById('projectBoardModal')?.dataset.projectId;
    if (data.project_id !== currentProjectId) {
      console.log('프로젝트 ID 불일치:', { received: data.project_id, current: currentProjectId });
      return;
    }

    const comment = data.comment;
    if (!comment || !comment.id) {
      console.error('댓글 데이터 누락:', data);
      return;
    }

    const div = document.querySelector(`.comment[data-id="${comment.id}"]`);
    if (!div) {
      console.warn('댓글 요소를 찾을 수 없음:', comment.id);
      return;
    }

    const contentSpan = div.querySelector('.comment-content');
    if (contentSpan) {
      contentSpan.textContent = comment.content || '내용 없음';
      console.log('댓글 내용 갱신:', comment.content);
    } else {
      console.warn('댓글 내용 요소(.comment-content)를 찾을 수 없음:', comment.id);
    }

    let img = div.querySelector('img');
    console.log('이미지 처리 시작:', { image_url: comment.image_url, delete_image: comment.delete_image });

    if (comment.image_url && !comment.delete_image) {
      if (!img) {
        img = document.createElement('img');
        img.className = 'img-fluid d-block';
        const timestampSpan = div.querySelector('.comment-timestamp');
        if (timestampSpan && timestampSpan.nextSibling) {
          div.insertBefore(img, timestampSpan.nextSibling);
        } else {
          div.appendChild(img);
        }
      }
      img.src = comment.image_url;
      img.style.maxHeight = '200px';
      console.log('이미지 업로드 반영:', comment.image_url);
    } else {
      if (img) {
        img.remove();
        console.log('이미지 제거됨:', comment.id);
      }
      if (comment.delete_image) {
        console.log('delete_image 플래그로 이미지 제거:', comment.id);
      } else if (!comment.image_url) {
        console.log('image_url이 null이므로 이미지 제거:', comment.id);
      }
    }

    const timestampSpan = div.querySelector('.comment-timestamp');
    if (timestampSpan && comment.timestamp) {
      timestampSpan.textContent = new Date(comment.timestamp).toLocaleString('ko-KR');
      console.log('타임스탬프 갱신:', comment.timestamp);
    }
  });

  socket.on("project_updated", (data) => {
    console.log("프로젝트 업데이트 이벤트 수신:", data);
    const cardEl = document.querySelector(`.project-card-wrapper[data-project-id="${data.project_id}"]`);

    if (data.action === "수정") {
      if (!cardEl) return;
      cardEl.querySelector(".card-title").textContent = data.name;
      cardEl.querySelector(".truncate-description").textContent = data.description || "";
      cardEl.dataset.deadline = data.deadline || "";
    } else if (data.action === "나가기") {
      if (!cardEl) return;
      const countEl = cardEl.querySelector(".member-count");
      if (!countEl) return;
      const current = parseInt(countEl.textContent) || 0;
      countEl.textContent = `${current - 1} members`;
      console.log("멤버 수 갱신:", countEl.textContent);
      if (data.user_nickname !== window.currentUserNickname) alert(`👋 ${data.user_nickname}님이 프로젝트를 나갔습니다.`, "info");
    } else if (data.action === "삭제") {
      if (cardEl) cardEl.remove();
      if (data.user_nickname !== window.currentUserNickname) alert(`📌 ${data.user_nickname}님이 프로젝트를 삭제했습니다.`, "info");
    }
  });

  const projectBoardModal = document.getElementById('projectBoardModal');
  if (projectBoardModal) {
    projectBoardModal.addEventListener("click", async e => {
      const target = e.target;
      const button = target.closest("#modalDeleteBtn, #modalLeaveBtn");
      if (!button) return;

      e.stopPropagation();
      const projectId = button.dataset.projectId;
      if (!projectId) {
        alert("프로젝트 ID를 찾을 수 없습니다.");
        console.error("Project ID is missing on button:", button);
        return;
      }

      const isOwner = button.id === "modalDeleteBtn" || button.classList.contains("delete-project");
      const action = isOwner ? "삭제" : "나가기";
      const endpoint = `/projects/${projectId}`;

      console.log(`Attempting to ${action} project with ID: ${projectId}, Endpoint: ${endpoint}`);
      if (confirm(`이 프로젝트를 ${action}하시겠습니까?`)) {
        try {
          await socket.emit('project_updated', { project_id: projectId, action: action });
          const response = await fetch(endpoint, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
          });
          if (response.ok) {
            const data = await response.json();
            alert(data.message || `프로젝트가 ${action}되었습니다.`);

            const bsModal = bootstrap.Modal.getInstance(projectBoardModal);
            bsModal.hide();

            const wrapper = document.querySelector(`.project-card-wrapper[data-project-id="${projectId}"]`);
            if (wrapper) {
              wrapper.classList.add("fade-out");
              setTimeout(() => wrapper.remove(), 300);
            }
          } else {
            const error = await response.json().catch(() => ({}));
            console.error(`Failed to ${action} project:`, error);
            alert(error.error || `프로젝트 ${action} 실패`);
          }
        } catch (err) {
          console.error(`Project ${action} error:`, err);
          alert("오류가 발생했습니다. 다시 시도해 주세요.");
        }
      }
    });
  } else {
    console.error("projectBoardModal element not found");
  }

  async function loadProjectOrder() {
    try {
      const response = await fetch("/projects/order", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        const order = data.order;
        const container = document.querySelector(".project-scroll-container");
        if (!container) {
          console.error("Project scroll container not found.");
          return;
        }
        const cards = Array.from(container.querySelectorAll(".project-card-wrapper"));
        order.forEach(projectId => {
          socket.emit('join', projectId);
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
};

const currentUser = window.currentUser || { id: "", nickname: "" };

document.getElementById("createProject").addEventListener("click", async (e) => {
  e.preventDefault();
  const button = e.target;
  if (button.disabled) return;
  button.disabled = true;

  const form = document.getElementById("newProjectForm");
  const formData = new FormData(form);
  const projectId = formData.get("projectId");

  const name = formData.get("name").trim();
  if (!name) {
    alert("프로젝트 이름을 입력해주세요.");
    button.disabled = false;
    return;
  }

  const payload = {
    name: formData.get("name"),
    description: formData.get("description"),
    deadline: formData.get("deadline"),
  };
  const url = projectId ? `/projects/${projectId}` : "/projects/create";
  const method = projectId ? "PUT" : "POST";

  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const project = await response.json();
      if (projectId) {
        const wrap = document.querySelector(`.project-card-wrapper[data-project-id="${projectId}"]`);
        if (wrap) {
          wrap.querySelector(".card-title").textContent = project.name;
          wrap.querySelector(".truncate-description").textContent = project.description || "";
          wrap.dataset.deadline = project.deadline || "";
        }
        alert("프로젝트가 수정되었습니다!");
      } else {
        appendProjectCard(project);
        window.currentProjectId = project.id;
        socket.emit('join', project.id);
        alert("프로젝트가 생성되었습니다!");
      }

      const modalEl = document.getElementById("newProjectModal");
      const modalInst = bootstrap.Modal.getOrCreateInstance(modalEl);
      modalInst.hide();
      form.reset();
      form.projectId.value = "";
      document.querySelector("#newProjectModalLabel").textContent = "Create New Project";
      button.textContent = "Create Project";
    } else {
      const error = await response.json().catch(() => ({}));
      alert(error.message || "프로젝트 저장에 실패했습니다.");
    }
  } catch (err) {
    console.error("Project save error:", err);
    alert("오류가 발생했습니다.");
  } finally {
    button.disabled = false;
  }
});

document.addEventListener("click", e => {
  const btn = e.target.closest(".edit-project-btn");
  if (!btn) return;
  e.stopPropagation();

  const projectId = btn.dataset.projectId;
  const wrap = document.querySelector(`.project-card-wrapper[data-project-id="${projectId}"]`);
  const name = wrap.querySelector(".card-title").textContent.trim();
  const desc = wrap.querySelector(".truncate-description").textContent.trim();
  const deadline = wrap.dataset.deadline || "";

  const form = document.getElementById("newProjectForm");
  form.name.value = name;
  form.description.value = desc;
  form.deadline.value = deadline;
  const dlGroup = form.querySelector('input[name="deadline"]')?.closest('.mb-3');
  if (dlGroup) dlGroup.classList.add('d-none');
  form.projectId.value = projectId;

  document.getElementById("newProjectModalLabel").textContent = "Edit Project";
  document.getElementById("createProject").textContent = "Save Changes";

  const modalEl = document.getElementById("newProjectModal");
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
});

document.querySelector('[data-bs-toggle="modal"][data-bs-target="#newProjectModal"]')
  ?.addEventListener("click", () => {
    const form = document.getElementById("newProjectForm");
    form.reset();
    form.projectId.value = "";
    document.getElementById("newProjectModalLabel").textContent = "Create New Project";
    document.getElementById("createProject").textContent = "Create Project";
    const dlGroup = form.querySelector('input[name="deadline"]')?.closest('.mb-3');
    if (dlGroup) dlGroup.classList.remove('d-none');
  });

document.getElementById("newProjectForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  document.getElementById("createProject").click();
});

function appendProjectCard(project) {
  const container = document.querySelector('.project-scroll-container');
  if (!container) return console.error('Project container not found');

  const wrapper = document.createElement('div');
  wrapper.className = 'project-card-wrapper';
  wrapper.dataset.projectId = project.id;
  wrapper.dataset.ownerId = project.owner.$oid || project.owner;

  if (project.deadline) {
    const deadlineDate = new Date(project.deadline);
    if (!isNaN(deadlineDate.getTime())) {
      const deadlineStr = deadlineDate.toISOString().slice(0, 10);
      wrapper.dataset.deadline = deadlineStr;
    } else {
      wrapper.dataset.deadline = '';
    }
  } else {
    wrapper.dataset.deadline = '';
  }

  const today = dateOnly(new Date());
  const deadlineDate = wrapper.dataset.deadline ? dateOnly(wrapper.dataset.deadline) : null;
  let diff;
  if (deadlineDate) {
    diff = Math.floor((deadlineDate - today) / (1000 * 60 * 60 * 24));
  } else {
    diff = null;
  }

  if (diff === null) {
    wrapper.dataset.dDay = '';
  } else if (diff > 0) {
    wrapper.dataset.dDay = `D-${diff}`;
  } else if (diff === 0) {
    wrapper.dataset.dDay = 'D-Day';
  } else {
    wrapper.dataset.dDay = `D+${Math.abs(diff)}`;
  }

  console.log(`Deadline: ${wrapper.dataset.deadline}, dDay: ${wrapper.dataset.dDay}`);

  wrapper.innerHTML = `
    <div class="card project-card h-100 position-relative">
      <button type="button"
              class="btn btn-sm btn-outline-secondary edit-project-btn position-absolute top-0 end-0 m-2"
              data-project-id="${project.id}"
              aria-label="Edit Project">
        <i class="bi bi-pencil"></i>
      </button>
      <div class="card-body">
        <h5 class="card-title">${project.name}</h5>
        <p class="card-text truncate-description">${project.description || ''}</p>
        <div class="card-container mt-3" data-project-id="${project.id}"></div>
        <span class="member-count" data-members="${project.members?.length || 0}">
          ${project.members?.length || 0} members
        </span>
        <button class="btn add-card-btn mt-2 w-100"
                data-project-id="${project.id}">
          <span class="add-card-content"><i class="bi bi-plus-lg"></i> 카드 추가</span>
        </button>
      </div>
      <button class="btn btn-sm btn-outline-primary invite-member position-absolute start-0 bottom-0 m-2"
              data-project-id="${project.id}">
        <i class="bi bi-person-plus"></i> Invite
      </button>
      <button class="btn btn-sm btn-outline-success open-chat-btn position-absolute end-0 bottom-0 m-2"
              data-project-id="${project.id}"
              data-project-name="${project.name}">
        <i class="bi bi-chat-dots"></i> Chat
      </button>
    </div>
  `;
  container.appendChild(wrapper);
  wrapper.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function renderCommentHTML(comment) {
  const isMine = comment.author_id === currentUser.id;
  const time = new Date(comment.timestamp).toLocaleString('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
  const escapedContent = comment.content ? comment.content.replace(/</g, '<').replace(/>/g, '>') : '';

  return `
    <div class="comment mb-2" data-id="${comment.id}">
      <b>${comment.nickname}</b>
      <span style="color:gray; font-size:small;" class="comment-timestamp">${time}</span><br>
      <span class="comment-content">${escapedContent}</span>
      ${comment.image_url ? `
        <div class="mt-2">
          <img src="${comment.image_url}" class="img-fluid d-block" style="max-height:200px; margin-top:10px;" />
        </div>
      ` : ""}
      ${isMine ? `
        <div class="mt-1">
          <button class="btn btn-sm btn-outline-secondary edit-comment-btn">수정</button>
          <button class="btn btn-sm btn-outline-danger delete-comment-btn">삭제</button>
        </div>
      ` : ""}
    </div>
  `;
}

function dateOnly(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}