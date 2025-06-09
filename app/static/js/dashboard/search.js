document.addEventListener('DOMContentLoaded', () => {
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  const searchButton = document.querySelector('[data-bs-target="#searchModal"]');
  if (searchButton) {
    searchButton.addEventListener('click', () => {
      console.log('검색 버튼 클릭, 검색 모달 열기');
    });
  }

  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const dueDateInput = document.getElementById('dueDateInput');
  const searchResults = document.getElementById('searchResults');

  // 하이라이트 적용 함수
  function applyHighlight(element) {
    if (!element) {
      console.warn('하이라이트 요소를 찾을 수 없음');
      return;
    }
    document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
    element.classList.add('highlight');
    console.log('하이라이트 적용:', element);
    setTimeout(() => {
      if (element.classList.contains('highlight')) {
        element.classList.remove('highlight');
        console.log('하이라이트 제거:', element);
      }
    }, 2000); // 2초 후 제거
  }

  function renderResults(data) {
    searchResults.innerHTML = '';
    if (!data.projects.length && !data.cards.length) {
      searchResults.innerHTML = '<p class="text-muted">검색 결과가 없습니다.</p>';
      return;
    }

    if (data.projects.length) {
      const projectHeader = document.createElement('h6');
      projectHeader.textContent = '프로젝트';
      searchResults.appendChild(projectHeader);
      const projectList = document.createElement('ul');
      projectList.className = 'list-group mb-3';
      data.projects.forEach(project => {
        const li = document.createElement('li');
        li.className = 'list-group-item list-group-item-action';
        li.dataset.projectId = project.id;
        li.innerHTML = `
          <strong>${project.name}</strong>
          <p class="mb-0 text-muted">${project.description || '설명 없음'}</p>
          <small class="text-muted">마감일: ${project.due_date || '미설정'}</small>
        `;
        li.addEventListener('click', () => {
          const searchModal = bootstrap.Modal.getInstance(document.getElementById('searchModal'));
          searchModal.hide();
          const projectElement = document.querySelector(`.project-card-wrapper[data-project-id="${project.id}"]`);
          if (projectElement) {
            projectElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            requestAnimationFrame(() => {
              applyHighlight(projectElement);
            });
          } else {
            console.warn(`프로젝트 요소를 찾을 수 없음: ${project.id}`);
          }
          console.log(`클릭한 프로젝트: ${project.name}`);
        });
        projectList.appendChild(li);
      });
      searchResults.appendChild(projectList);
    }

    if (data.cards.length) {
      const cardHeader = document.createElement('h6');
      cardHeader.textContent = '카드';
      searchResults.appendChild(cardHeader);
      const cardList = document.createElement('ul');
      cardList.className = 'list-group';
      data.cards.forEach(card => {
        const li = document.createElement('li');
        li.className = 'list-group-item list-group-item-action';
        li.dataset.cardId = card.id;
        li.dataset.projectId = card.project_id;
        li.innerHTML = `
          <strong>${card.title}</strong> (프로젝트: ${card.project_name})
          <p class="mb-0 text-muted">${card.description || '설명 없음'}</p>
          <small class="text-muted">마감일: ${card.due_date || '미설정'}</small>
        `;
        li.addEventListener('click', () => {
          const searchModal = bootstrap.Modal.getInstance(document.getElementById('searchModal'));
          searchModal.hide();
          const projectElement = document.querySelector(`.project-card-wrapper[data-project-id="${card.project_id}"]`);
          if (projectElement) {
            projectElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            requestAnimationFrame(() => {
              applyHighlight(projectElement);
            });
          } else {
            console.warn(`카드의 프로젝트 요소를 찾을 수 없음: ${card.id}, 프로젝트: ${card.project_id}`);
          }
          console.log(`클릭한 카드: ${card.title}, 프로젝트: ${card.project_name}`);
        });
        cardList.appendChild(li);
      });
      searchResults.appendChild(cardList);
    }
  }

  async function performSearch(keyword, dueDate) {
    try {
      if (!keyword.trim() && !dueDate) {
        searchResults.innerHTML = '<p class="text-muted">키워드 또는 마감일을 입력하세요.</p>';
        return;
      }
      const queryParams = new URLSearchParams();
      if (keyword.trim()) {
        queryParams.append('keyword', keyword);
      }
      if (dueDate) {
        queryParams.append('due_date', dueDate);
      }
      const response = await fetch(`/projects/search?${queryParams.toString()}`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`HTTP 오류! 상태: ${response.status}`);
      }
      const data = await response.json();
      console.log('검색 결과:', data);
      renderResults(data);
    } catch (error) {
      console.error('검색 오류:', error);
      searchResults.innerHTML = '<p class="text-danger">검색 중 오류가 발생했습니다.</p>';
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      console.log(`키워드 입력: ${e.target.value}`);
    });

    searchInput.addEventListener('input', debounce((e) => {
      performSearch(e.target.value, dueDateInput.value);
    }, 300));
  }

  if (dueDateInput) {
    dueDateInput.addEventListener('change', (e) => {
      console.log(`마감일 선택: ${e.target.value}`);
      performSearch(searchInput.value, e.target.value);
    });
  }

  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const keyword = searchInput.value;
      const dueDate = dueDateInput.value;
      console.log(`검색 폼 제출 - 키워드: ${keyword}, 마감일: ${dueDate}`);
      performSearch(keyword, dueDate);
    });
  }

  const searchModal = document.getElementById('searchModal');
  if (searchModal) {
    searchModal.addEventListener('shown.bs.modal', () => {
      setTimeout(() => {
        searchInput.focus();
        console.log('검색 모달 표시, searchInput에 포커스');
      }, 50);
      searchInput.value = '';
      dueDateInput.value = '';
      searchResults.innerHTML = '<p class="text-muted">키워드 또는 마감일을 입력하세요.</p>';
    });
  }
});