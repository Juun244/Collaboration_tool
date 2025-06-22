let isModalInitialized = false;

window.initializeModals = function() {
  if (isModalInitialized) {
    console.log("모달이 이미 초기화되어 있습니다.");
    return;
  }

  console.log("initializeModals 호출됨");

  const handleEvent = async (e) => {
    console.log(`이벤트 발생: ${e.type}, 타겟:`, e.target);

    if (e.target.closest('[data-bs-dismiss="modal"]')) {
      console.log('모달 닫기 버튼 터치/클릭');
      return;
    }

    if (e.target.closest('.edit-card-btn, .delete-card-btn')) {
      console.log('카드 버튼 터치/클릭, cards.js로 위임');
      return;
    }

    if (e.type === 'click' || e.type === 'touchend') {
      const addBtn = e.target.closest('.add-card-btn');
      if (addBtn) {
        console.log('카드 추가 버튼 클릭/터치:', addBtn.dataset.projectId);
        e.stopPropagation();
        e.preventDefault();
        const projectId = addBtn.dataset.projectId;
        const status = addBtn.dataset.status || 'todo';

        const modalElem = document.getElementById("createCardModal");
        if (!modalElem) {
          console.error('createCardModal 요소를 찾을 수 없음');
          return;
        }
        const form = modalElem.querySelector('#createCardForm');
        if (!form) {
          console.error('createCardForm 요소를 찾을 수 없음');
          return;
        }

        form.projectId.value = projectId;
        form.status.value = status;
        window.currentProjectId = projectId;

        const bsModal = new bootstrap.Modal(modalElem, { backdrop: 'static', keyboard: true });
        bsModal.show();
        return;
      }

      const inviteBtn = e.target.closest(".invite-member");
      if (inviteBtn) {
        console.log("초대 모달 클릭/터치:", inviteBtn.dataset.projectId);
        e.stopPropagation();
        e.preventDefault();
        const projectId = inviteBtn.dataset.projectId;
        const inputElem = document.getElementById("inviteProjectId");

        if (!projectId || !inputElem) {
          console.error('projectId 또는 inviteProjectId 요소 누락:', { projectId, inputElem });
          return;
        }

        inputElem.value = projectId;
        const bsModal = new bootstrap.Modal(document.getElementById("inviteMemberModal"), { backdrop: 'static', keyboard: true });
        bsModal.show();
        return;
      }

      const chatBtn = e.target.closest('.open-chat-btn');
      if (chatBtn) {
        console.log("채팅 버튼 클릭/터치:", chatBtn.dataset.projectId, chatBtn.dataset.projectName);

        e.preventDefault(); // 모바일 기본 동작 방지
        e.stopPropagation();

        const projectId = chatBtn.dataset.projectId;
        const projectName = chatBtn.dataset.projectName || projectId;

        if (!projectId) {
          console.error("chatBtn에 projectId 누락");
          return;
        }

        // 항상 이벤트 발생 (중복 방지 X, 단순하게)
        document.dispatchEvent(new CustomEvent('openChat', {
          detail: { projectId, projectName }
        }));

        return;
      }

      const editBtn = e.target.closest('.edit-project-btn');
      if (editBtn) {
        console.log("프로젝트 수정 버튼 클릭/터치:", editBtn.dataset.projectId);
        e.stopPropagation();
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('editProject', { detail: { projectId: editBtn.dataset.projectId } }));
        return;
      }

      const card = e.target.closest('.project-card');
      if (card && !e.target.closest(".invite-member, .open-chat-btn, .add-card-btn, .edit-project-btn")) {
        console.log("프로젝트 카드 클릭/터치:", card);
        e.stopPropagation();
        e.preventDefault();
        const wrapper = card.closest('.project-card-wrapper');
        if (!wrapper) {
          console.error('project-card-wrapper 요소를 찾을 수 없음');
          return;
        }
        window.currentProjectId = wrapper.dataset.projectId;
        const modalElem = document.getElementById("projectBoardModal");
        if (!modalElem) {
          console.error('projectBoardModal 요소를 찾을 수 없음');
          return;
        }

        modalElem.dataset.projectId = window.currentProjectId;
        const titleElem = document.getElementById("projectBoardTitle");
        const cardTitle = card.querySelector(".card-title");
        if (titleElem && cardTitle) {
          titleElem.textContent = cardTitle.textContent;
        }
        const deleteBtn = document.getElementById("modalDeleteBtn");
        const leaveBtn = document.getElementById("modalLeaveBtn");
        const commentBtn = document.getElementById("add-comment-btn");
        if (deleteBtn) deleteBtn.dataset.projectId = window.currentProjectId;
        if (leaveBtn) leaveBtn.dataset.projectId = window.currentProjectId;
        if (commentBtn) commentBtn.dataset.projectId = window.currentProjectId;

        const isOwner = currentUser.id === wrapper.dataset.ownerId;
        if (isOwner) {
          console.log("모달 열기 - 프로젝트 소유자 확인됨");
          if (deleteBtn) deleteBtn.classList.remove('d-none');
          if (leaveBtn) leaveBtn.classList.add('d-none');
        } else {
          console.log("모달 열기 - 프로젝트 소유자 아님");
          if (deleteBtn) deleteBtn.classList.add('d-none');
          if (leaveBtn) leaveBtn.classList.remove('d-none');
        }

        const deadlineText = wrapper.dataset.deadline || '';
        const ddayBadge = wrapper.dataset.dDay || '';
        const dlElem = document.getElementById("modalDeadline");
        const ddElem = document.getElementById("modalDday");

        if (dlElem && ddElem) {
          if (!deadlineText || deadlineText === '없음') {
            dlElem.textContent = '없음';
            ddElem.textContent = '';
            ddElem.classList.add('d-none');
          } else {
            dlElem.textContent = deadlineText;
            ddElem.textContent = ddayBadge;
            ddElem.classList.remove('d-none');
            if (ddayBadge === 'D-Day') {
              ddElem.className = 'badge bg-danger';
            } else if (ddayBadge.startsWith('D-')) {
              ddElem.className = 'badge bg-success';
            } else if (ddayBadge.startsWith('D+')) {
              ddElem.className = 'badge bg-secondary';
            } else {
              ddElem.className = 'badge bg-secondary';
            }
          }
        }

        const bsModal = new bootstrap.Modal(modalElem, { backdrop: 'static', keyboard: true });
        bsModal.show();

        Promise.all([
          loadComments(window.currentProjectId),
          typeof loadHistory === 'function' ? loadHistory(window.currentProjectId) : Promise.resolve()
        ]).catch(err => console.error("모달 데이터 로드 오류:", err));

        const addCommentBtn = document.getElementById("add-comment-btn");
        if (addCommentBtn) {
          addCommentBtn.onclick = async () => {
            console.log("모달 내 댓글 추가 버튼 클릭됨");
            const contentInput = document.getElementById('new-comment-content');
            const fileInput = document.getElementById('new-comment-image');
            const content = contentInput?.value.trim();
            const projectId = modalElem.dataset.projectId;

            if (!content && !fileInput?.files.length) {
              alert("댓글 또는 이미지를 입력하세요.");
              return;
            }
            if (!projectId) {
              alert("프로젝트 ID를 찾을 수 없습니다.");
              return;
            }

            const formData = new FormData();
            if (content) formData.append('content', content);
            if (fileInput?.files.length) formData.append('image', fileInput.files[0]);

            try {
              const res = await fetch(`/projects/${projectId}/comments`, {
                method: 'POST',
                body: formData,
                credentials: 'include'
              });

              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(err.error || "댓글 추가 실패");
                return;
              }

              const responseData = await res.json();
              contentInput.value = '';
              fileInput.value = '';
              socket.emit("add_comment", {
                project_id: projectId,
                comment_id: responseData.id,
                content,
                image_url: responseData.image_url || null,
                author_id: currentUser.id,
                author_name: window.currentUserNickname
              });

              await loadComments(projectId);
            } catch (err) {
              console.error("댓글 추가 중 오류:", err);
              alert("댓글 추가 중 오류가 발생했습니다.");
            }
          };
        }

        const commentList = document.getElementById('comment-list');
        if (commentList) {
          const handleCommentClick = async (e) => {
            console.log('댓글 리스트 이벤트:', e.type, e.target);
            const btn = e.target.closest('button');
            if (!btn) return;

            const commentDiv = btn.closest('.comment');
            if (!commentDiv) {
              console.error('Comment div not found');
              return;
            }

            const commentId = commentDiv.dataset.id;
            if (!commentId) {
              console.error('Comment ID not found in comment div');
              return;
            }

            const projectId = modalElem.dataset.projectId;
            if (!projectId) {
              console.error('Project ID not found');
              return;
            }

            console.log('Comment action:', {
              action: btn.classList.contains('edit-comment-btn') ? 'edit' :
                      btn.classList.contains('save-comment-btn') ? 'save' :
                      btn.classList.contains('delete-comment-btn') ? 'delete' : 'unknown',
              commentId,
              projectId
            });

            if (btn.classList.contains('edit-comment-btn')) {
              startInlineEdit(commentDiv);
            } else if (btn.classList.contains('save-comment-btn')) {
              console.log('Save button clicked for comment:', commentId);
              await saveInlineEdit(commentDiv, projectId);
            } else if (btn.classList.contains('cancel-comment-btn')) {
              cancelInlineEdit(commentDiv);
            } else if (btn.classList.contains('delete-comment-btn')) {
              if (confirm("정말 삭제할까요?")) {
                await deleteComment(commentId, projectId);
              }
            }
          };

          commentList.addEventListener('click', handleCommentClick, { passive: true });
          commentList.addEventListener('touchstart', handleCommentClick, { passive: false });

          modalElem.addEventListener('hidden.bs.modal', () => {
            commentList.removeEventListener('click', handleCommentClick);
            commentList.removeEventListener('touchstart', handleCommentClick);
            console.log('댓글 리스트 이벤트 리스너 제거됨');
          }, { once: true });
        }

        const editBtn = document.getElementById("editDeadlineBtn");
        if (editBtn) {
          editBtn.onclick = () => {
            if (editBtn.parentNode.querySelector('input[type="date"]')) return;

            const tmp = document.createElement('input');
            tmp.type = 'date';
            tmp.value = wrapper.dataset.deadline || '';
            tmp.style.marginLeft = '0.5rem';
            editBtn.parentNode.insertBefore(tmp, editBtn.nextSibling);

            tmp.focus();
            if (typeof tmp.showPicker === 'function') tmp.showPicker();

            tmp.onchange = async () => {
              const newDate = tmp.value;
              tmp.remove();

              const projectId = window.currentProjectId;
              let response;
              if (!newDate) {
                response = await fetch(`/projects/${projectId}/deadline`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ deadline: null }),
                  credentials: 'include'
                });
                const body = await response.json();
                if (!response.ok) {
                  return alert(body.error || '업데이트 실패');
                }

                dlElem.textContent = '없음';
                ddElem.textContent = '';
                ddElem.classList.add('d-none');
                delete wrapper.dataset.deadline;
                delete wrapper.dataset.dDay;

                socket.emit('set_project_deadline', {
                  project_id: projectId,
                  deadline: null,
                  user_id: currentUser.id,
                  nickname: window.currentUserNickname
                });

                if (typeof loadHistory === 'function') {
                  await loadHistory(projectId);
                }
                const histList = document.getElementById("history-list");
                const histArrow = document.getElementById("history-arrow");
                if (histList && histArrow && !histList.classList.contains("open")) {
                  histList.classList.add("open");
                  histArrow.classList.replace("bi-caret-right-fill", "bi-caret-down-fill");
                }

                alert('마감일이 삭제되었습니다.');
                return;
              }

              response = await fetch(`/projects/${projectId}/deadline`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deadline: newDate }),
                credentials: 'include'
              });
              const body = await response.json();
              if (!response.ok) {
                return alert(body.error || '업데이트 실패');
              }

              dlElem.textContent = newDate;
              const today = dateOnly(new Date());
              const deadlineDate = dateOnly(newDate);
              const diff = Math.floor((deadlineDate - today) / (1000 * 60 * 60 * 24));

              if (diff > 0) {
                ddElem.textContent = `D-${diff}`;
                ddElem.classList.add('bg-success');
                ddElem.classList.remove('bg-danger', 'bg-secondary');
              } else if (diff === 0) {
                ddElem.textContent = 'D-Day';
                ddElem.classList.add('bg-danger');
                ddElem.classList.remove('bg-success', 'bg-secondary');
              } else {
                ddElem.textContent = `D+${Math.abs(diff)}`;
                ddElem.classList.add('bg-secondary');
                ddElem.classList.remove('bg-success', 'bg-danger');
              }
              ddElem.classList.remove('d-none');
              ddElem.style.fontWeight = 'bold';

              wrapper.dataset.deadline = newDate;
              wrapper.dataset.dDay = ddElem.textContent;

              socket.emit('set_project_deadline', {
                project_id: projectId,
                deadline: newDate,
                user_id: currentUser.id,
                nickname: window.currentUserNickname
              });

              if (typeof loadHistory === 'function') {
                await loadHistory(projectId);
              }
              alert('마감일이 업데이트되었습니다.');
            };
          };
        }

        socket.on('set_project_deadline', async (data) => {
          console.log('set_project_deadline 이벤트 수신:', data);
          const modal = document.getElementById('projectBoardModal');
          const currentProjectId = modal?.dataset.projectId;

          if (!modal || !data || data.project_id !== currentProjectId) {
            console.log('모달 없음 또는 프로젝트 ID 불일치:', {
              received: data?.project_id,
              current: currentProjectId,
              modalExists: !!modal
            });
            return;
          }

          const dlElem = document.getElementById("modalDeadline");
          const ddElem = document.getElementById("modalDday");
          const wrapper = document.getElementById("deadline-wrapper");
          if (!dlElem || !ddElem || !wrapper) {
            console.warn('마감일 UI 요소를 찾을 수 없음:', {
              dlExists: !!dlElem,
              ddExists: !!ddElem,
              wrapperExists: !!wrapper
            });
            return;
          }

          if (!data.deadline) {
            dlElem.textContent = '없음';
            ddElem.textContent = '';
            ddElem.classList.add('d-none');
            delete wrapper.dataset.deadline;
            delete wrapper.dataset.dDay;
            console.log('마감일 삭제됨:', data.project_id);
            if (typeof loadHistory === 'function') {
              await loadHistory(data.project_id);
            }
            return;
          }

          dlElem.textContent = data.deadline;
          const today = dateOnly(new Date());
          const deadlineDate = dateOnly(data.deadline);
          const diff = Math.floor((deadlineDate - today) / (1000 * 60 * 60 * 24));

          if (diff > 0) {
            ddElem.textContent = `D-${diff}`;
            ddElem.classList.add('bg-success');
            ddElem.classList.remove('bg-danger', 'bg-secondary');
          } else if (diff === 0) {
            ddElem.textContent = 'D-Day';
            ddElem.classList.add('bg-danger');
            ddElem.classList.remove('bg-success', 'bg-secondary');
          } else {
            ddElem.textContent = `D+${Math.abs(diff)}`;
            ddElem.classList.add('bg-secondary');
            ddElem.classList.remove('bg-success', 'bg-danger');
          }
          ddElem.classList.remove('d-none');
          ddElem.style.fontWeight = 'bold';

          wrapper.dataset.deadline = data.deadline;
          wrapper.dataset.dDay = ddElem.textContent;
          console.log('마감일 업데이트됨:', { deadline: data.deadline, dDay: ddElem.textContent });
          if (typeof loadHistory === 'function') {
            await loadHistory(data.project_id);
          }
        });

        if (typeof loadCards === 'function') {
          loadCards();
        }
        if (typeof loadHistory === 'function') {
          await loadHistory(window.currentProjectId);
        }
      }
    }
  };

  document.addEventListener('click', handleEvent);
  document.addEventListener('touchstart', handleEvent, { passive: false });
  document.addEventListener('touchend', handleEvent, { passive: false });

  isModalInitialized = true;
  console.log("모달 초기화가 완료되었습니다.");
};

function dateOnly(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startInlineEdit(div) {
  if (div.querySelector('textarea')) return;
  const span = div.querySelector('.comment-content');
  const origImg = div.querySelector('img');
  if (span) span.style.display = 'none';

  const textarea = document.createElement('textarea');
  textarea.className = 'form-control mb-2';
  textarea.value = span?.textContent || '';
  textarea.rows = 2;
  div.appendChild(textarea);

  let fileInput, removeBtn;
  if (origImg) {
    removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'X';
    removeBtn.title = '이미지 삭제';
    removeBtn.className = 'btn btn-sm btn-danger ms-2';
    origImg.after(removeBtn);
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.className = 'form-control mt-2 d-none';
    div.appendChild(fileInput);

    removeBtn.onclick = () => {
      origImg.remove();
      removeBtn.remove();
      fileInput.classList.remove('d-none');
    };
  } else {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.className = 'form-control mt-2';
    div.appendChild(fileInput);
  }

  const btnGroup = document.createElement('div');
  btnGroup.className = 'mt-2';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-sm btn-primary me-1 save-comment-btn';
  saveBtn.textContent = '저장';
  saveBtn.type = 'button';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-sm btn-secondary cancel-comment-btn';
  cancelBtn.textContent = '취소';
  cancelBtn.type = 'button';

  btnGroup.append(saveBtn, cancelBtn);
  div.appendChild(btnGroup);

  textarea.focus();
}

async function saveInlineEdit(div, projectId) {
  const commentId = div.dataset.id;
  const textarea = div.querySelector('textarea');
  const newText = textarea?.value.trim();
  const fileInput = div.querySelector('input[type=file]');
  const hasImage = fileInput && fileInput.files?.length > 0;
  const isImageRemoved = !div.querySelector('img') && div.querySelector('input[type=file]:not(.d-none)');

  if (!newText && !hasImage && !isImageRemoved) {
    return alert('댓글 내용을 입력하거나 이미지를 추가/삭제하세요.');
  }

  try {
    let responseData;
    if (hasImage || isImageRemoved) {
      const formData = new FormData();
      formData.append('content', newText);
      if (hasImage) formData.append('image', fileInput.files[0]);
      if (isImageRemoved) formData.append('delete_image', '1');

      console.log('이미지 업로드/삭제 요청:', { hasImage, isImageRemoved, content: newText, file: hasImage ? fileInput.files[0].name : null });
      const res = await fetch(`/comments/${commentId}`, {
        method: 'PUT',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) throw new Error(`댓글 저장 실패: ${res.status}`);
      responseData = await res.json();
      console.log('PUT API 응답:', responseData);

      socket.emit('edit_comment', {
        project_id: projectId,
        comment_id: commentId,
        content: newText,
        image_url: responseData.image_url || null,
        delete_image: isImageRemoved ? '1' : '0',
        author_id: currentUser.id,
        author_name: window.currentUserNickname
      });

      await loadComments(projectId);
    } else {
      const res = await fetch(`/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newText }),
        credentials: 'include'
      });

      if (!res.ok) throw new Error(`댓글 저장 실패: ${res.status}`);
      responseData = await res.json();
      console.log('PUT API 응답:', responseData);

      socket.emit('edit_comment', {
        project_id: projectId,
        comment_id: commentId,
        content: newText,
        image_url: null,
        delete_image: '0',
        author_id: currentUser.id,
        author_name: window.currentUserNickname
      });

      const contentSpan = div.querySelector('.comment-content');
      if (contentSpan) contentSpan.textContent = newText;
      textarea.remove();
      fileInput?.remove();
      div.querySelector('.btn-group')?.remove();
      if (span) span.style.display = '';
    }
  } catch (err) {
    console.error('댓글 수정 오류:', err);
    alert('댓글 수정 중 오류가 발생했습니다.');
  }
}

function cancelInlineEdit(div) {
  const span = div.querySelector('.comment-content');
  const textarea = div.querySelector('textarea');
  const fileInput = div.querySelector('input[type=file]');
  const removeBtn = div.querySelector('.btn-danger');
  const btnGroup = div.querySelector('.btn-group');

  if (span) span.style.display = '';
  textarea?.remove();
  fileInput?.remove();
  removeBtn?.remove();
  btnGroup?.remove();
}

async function deleteComment(commentId, projectId) {
  try {
    const res = await fetch(`/comments/${commentId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!res.ok) throw new Error(`댓글 삭제 실패: ${res.status}`);
    socket.emit('delete_comment', {
      project_id: projectId,
      comment_id: commentId
    });
    await loadComments(projectId);
  } catch (err) {
    console.error('댓글 삭제 오류:', err);
    alert('댓글 삭제 중 오류가 발생했습니다.');
  }
}

async function loadComments(projectId) {
  try {
    const res = await fetch(`/projects/${projectId}/comments`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error(`댓글 로드 실패: ${res.status}`);
    const data = await res.json();
    const commentList = document.getElementById('comment-list');
    if (commentList) {
      commentList.innerHTML = data.comments.map(comment => renderCommentHTML(comment)).join('');
    }
  } catch (err) {
    console.error('댓글 로드 오류:', err);
    alert('댓글 로드 중 오류가 발생했습니다.');
  }
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