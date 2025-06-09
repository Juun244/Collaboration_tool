// 이메일 유효성 검사 함수
function validateEmail(email) {
  const emailRegex = /^[\w\.-]+@[\w\.-]+\.\w+$/;
  return emailRegex.test(email);
}

// 비밀번호 유효성 검사 함수
function validatePassword(password) {
  const minLength = password.length >= 8;
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  return minLength && hasSpecialChar;
}

// 비밀번호 확인 일치 여부 검사
function validateConfirmPassword(password, confirmPassword) {
  return password === confirmPassword && confirmPassword !== "";
}

// 입력창 상태 업데이트
function updateInputState(inputElement, feedbackElement, isValid, feedbackMessage) {
  if (isValid) {
    inputElement.classList.remove("is-invalid");
    inputElement.classList.add("is-valid");
    feedbackElement.style.display = "none";
  } else {
    inputElement.classList.remove("is-valid");
    inputElement.classList.add("is-invalid");
    feedbackElement.textContent = feedbackMessage;
    feedbackElement.style.display = "block";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirm_password");
  const nicknameInput = document.getElementById("nickname");

  const emailFeedback = document.getElementById("emailFeedback");
  const passwordFeedback = document.getElementById("passwordFeedback");
  const confirmPasswordFeedback = document.getElementById("confirmPasswordFeedback");
  const nicknameFeedback = document.getElementById("nicknameFeedback");

  const form = document.getElementById("registerForm");

  // 닉네임 중복 검사
  nicknameInput.addEventListener("input", async () => {
    const nickname = nicknameInput.value.trim();
    if (!nickname) {
      nicknameFeedback.textContent = "";
      return;
    }

    try {
      const response = await fetch("/check-nickname", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ nickname })
      });

      const data = await response.json();
      if (data.exists) {
        nicknameFeedback.textContent = "⚠ 이미 사용 중인 닉네임입니다.";
        nicknameFeedback.className = "form-text text-danger";
      } else {
        nicknameFeedback.textContent = "✔ 사용 가능한 닉네임입니다.";
        nicknameFeedback.className = "form-text text-success";
      }
    } catch (error) {
      nicknameFeedback.textContent = "오류가 발생했습니다. 다시 시도해주세요.";
      nicknameFeedback.className = "form-text text-danger";
    }
  });

  // 실시간 입력 검사
  emailInput.addEventListener("input", () => {
    updateInputState(
      emailInput,
      emailFeedback,
      validateEmail(emailInput.value),
      "유효한 이메일 주소를 입력하세요."
    );
  });

  passwordInput.addEventListener("input", () => {
    const isValid = validatePassword(passwordInput.value);
    updateInputState(passwordInput, passwordFeedback, isValid, "비밀번호는 8자 이상이며, 특수문자를 포함해야 합니다.");

    // 비밀번호 확인도 같이 검사
    const confirmValid = validateConfirmPassword(passwordInput.value, confirmPasswordInput.value);
    updateInputState(confirmPasswordInput, confirmPasswordFeedback, confirmValid, "비밀번호가 일치하지 않습니다.");
  });

  confirmPasswordInput.addEventListener("input", () => {
    const confirmValid = validateConfirmPassword(passwordInput.value, confirmPasswordInput.value);
    updateInputState(confirmPasswordInput, confirmPasswordFeedback, confirmValid, "비밀번호가 일치하지 않습니다.");
  });

  // 폼 제출 시 최종 검사
  form.addEventListener("submit", (event) => {
    const isEmailValid = validateEmail(emailInput.value);
    const isPasswordValid = validatePassword(passwordInput.value);
    const isConfirmValid = validateConfirmPassword(passwordInput.value, confirmPasswordInput.value);

    if (!isEmailValid || !isPasswordValid || !isConfirmValid) {
      event.preventDefault();
      updateInputState(emailInput, emailFeedback, isEmailValid, "유효한 이메일 주소를 입력하세요.");
      updateInputState(passwordInput, passwordFeedback, isPasswordValid, "비밀번호는 8자 이상이며, 특수문자를 포함해야 합니다.");
      updateInputState(confirmPasswordInput, confirmPasswordFeedback, isConfirmValid, "비밀번호가 일치하지 않습니다.");
    }
  });

  // 다크 모드 토글
  const toggleBtn = document.querySelector('.btn-toggle-dark');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      localStorage.setItem('dark-mode', document.body.classList.contains('dark-mode'));
    });
  }

  if (localStorage.getItem('dark-mode') === 'true') {
    document.body.classList.add('dark-mode');
  }
});
