// body에 다크모드 클래스 적용
document.addEventListener('DOMContentLoaded', function() {
  const btn = document.getElementById('darkModeBtn');
  if (localStorage.getItem('darkMode') === 'on') {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
  btn.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';

  btn.addEventListener('click', function() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark ? 'on' : 'off');
    btn.textContent = isDark ? '☀️' : '🌙';
  });
});