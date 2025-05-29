function initializeInvitations() {
    const toggleButton = document.getElementById("toggleInvitations");
    const invitationList = document.getElementById("invitationList");
  
    toggleButton.addEventListener("click", () => {
      invitationList.style.display = invitationList.style.display === "none" ? "block" : "none";
      toggleButton.querySelector("i").classList.toggle("bi-chevron-down");
      toggleButton.querySelector("i").classList.toggle("bi-chevron-up");
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
              ${invitation.name}
              <div>
                <button class="btn btn-sm btn-success accept-invite" data-project-id="${invitation.id}">수락</button>
                <button class="btn btn-sm btn-danger decline-invite" data-project-id="${invitation.id}">거절</button>
              </div>
            `;
            invitationList.appendChild(li);
          });
  
          // 초대 응답 이벤트
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
                  alert(`초대를 ${action === "accept" ? "수락" : "거절"}했습니다.`);
                  loadInvitations();
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