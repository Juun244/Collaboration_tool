function initializeInvitations() {
  const toggleButton = document.getElementById("toggleInvitations");
  const invitationList = document.getElementById("invitationList");

  toggleButton.addEventListener("click", () => {
    invitationList.style.display = invitationList.style.display === "none" ? "block" : "none";
    toggleButton.querySelector("i").classList.toggle("bi-chevron-down");
    toggleButton.querySelector("i").classList.toggle("bi-chevron-up");
  });

  // 프로젝트 초대 이벤트 수신
  socket.on("invite_project", data => {
    console.log("초대 이벤트 수신:", data);
    loadInvitations(); // 초대 목록 재로딩
  });

  // 초대 응답 이벤트 수신 (수락/거절)
  socket.on("invite_response", data => {
    console.log("초대 응답 이벤트 수신:", data);

    const project_id = data.project_id;
    const nickname = data.nickname;

    if (data.accepted) {
      // 본인이 초대를 수락한 경우 → 새로고침만
      if (window.currentUserNickname === nickname) {
        alert("초대를 수락했습니다.");
        window.location.reload();
      } else {
        // 다른 사람이 초대를 수락한 경우
        alert("👤 새 멤버 참여: " + nickname);

        // 멤버 수 갱신
        const cardEl = document.querySelector(`.project-card-wrapper[data-project-id="${project_id}"]`);
        if (!cardEl) return;

        const countEl = cardEl.querySelector(".member-count");
        if (!countEl) return;

        const current = parseInt(countEl.textContent) || 0;
        countEl.textContent = `${current + 1} members`;
        console.log("멤버 수 갱신:", countEl.textContent);
      }
    } else {
      if (window.currentUserNickname === nickname) {
        alert("초대를 거절했습니다.");
        loadInvitations(); // 초대 목록 재로딩
      } else {
        alert("👤 " + nickname + " 님이 초대를 거절했습니다.");
      }
    }
  });

  // 초대 보내기
  document.getElementById("sendInvite").addEventListener("click", async () => {
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

        socket.emit('invite_project', {
          project_id: projectId,
          invitee_nickname: data.nickname,
        });

        console.log("초대 이벤트 전송:", {
          project_id: projectId,
          invitee_nickname: data.nickname,
        });

        bootstrap.Modal.getInstance(document.getElementById("inviteMemberModal")).hide();
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

  async function loadInvitations() {
    try {
      const response = await fetch("/invitations");
      if (response.ok) {
        const data = await response.json();
        invitationList.innerHTML = "";
        data.invitations.forEach(invitation => {
          const li = document.createElement("li");
          li.className = "list-group-item d-flex justify-content-between align-items-center";
          li.innerHTML = `
            ${invitation.nickname || invitation.name || "알 수 없음"}
            <div>
              <button class="btn btn-sm btn-success accept-invite" data-project-id="${invitation.id}">수락</button>
              <button class="btn btn-sm btn-danger decline-invite" data-project-id="${invitation.id}">거절</button>
            </div>
          `;
          invitationList.appendChild(li);
        });

        document.querySelectorAll(".accept-invite, .decline-invite").forEach(button => {
          button.addEventListener("click", async () => {
            const projectId = button.dataset.projectId;
            const action = button.classList.contains("accept-invite") ? "accept" : "decline";
            try {
              const response = await fetch("/invitations/respond", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ project_id: projectId, action })
              });
              if (response.ok) {
                if (action === "accept") {
                  socket.emit("respond_invite", { project_id: projectId , accepted: true });
                }
                else if (action === "decline") {
                  socket.emit("respond_invite", { project_id: projectId , accepted: false });
                }
              } else {
                const error = await response.json();
                alert(error.message || "초대 응답 실패");
              }
            } catch (err) {
              console.error("Respond invitation error:", err);
              alert("오류가 발생했습니다.");
            }
          });
        });
      } else {
        const error = await response.json();
        alert(error.message || "초대 목록 로드 실패");
      }
    } catch (err) {
      console.error("Load invitations error:", err);
      alert("초대 목록 로드 중 오류가 발생했습니다.");
    }
  }

  loadInvitations();
}
