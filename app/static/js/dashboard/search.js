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
      console.log('Search button clicked, opening search modal');
    });
  }

  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const dueDateInput = document.getElementById('dueDateInput');
  const searchResults = document.getElementById('searchResults');

  // 하이라이트 적용 함수
  function applyHighlight(element) {
    if (!element) {
      console.warn('Highlight element not found');
      return;
    }
    // 기존 하이라이트 제거
    document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
    element.classList.add('highlight');
    console.log('Highlight applied to:', element);
    setTimeout(() => {
      if (element.classList.contains('highlight')) {
        element.classList.remove('highlight');
        console.log('Highlight removed from:', element);
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
        `;
        li.addEventListener('click', () => {
          const searchModal = bootstrap.Modal.getInstance(document.getElementById('searchModal'));
          searchModal.hide();
          const projectElement = document.querySelector(`.project-card-wrapper[data-project-id="${project.id}"]`);
          if (projectElement) {
            projectElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // 렌더링 후 하이라이트
            requestAnimationFrame(() => {
              applyHighlight(projectElement);
            });
          } else {
            console.warn(`Project element not found: ${project.id}`);
          }
          console.log(`Clicked project: ${project.name}`);
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
        `;
        li.addEventListener('click', () => {
          const searchModal = bootstrap.Modal.getInstance(document.getElementById('searchModal'));
          searchModal.hide();
          const projectElement = document.querySelector(`.project-card-wrapper[data-project-id="${card.project_id}"]`);
          if (projectElement) {
            projectElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // 렌더링 후 하이라이트
            requestAnimationFrame(() => {
              applyHighlight(projectElement);
            });
          } else {
            console.warn(`Project element not found for card: ${card.id}, project: ${card.project_id}`);
          }
          console.log(`Clicked card: ${card.title} in project ${card.project_name}`);
        });
        cardList.appendChild(li);
      });
      searchResults.appendChild(cardList);
    }
  }

  async function performSearch(keyword) {
    try {
      if (!keyword.trim()) {
        searchResults.innerHTML = '<p class="text-muted">키워드를 입력하세요.</p>';
        return;
      }
      const response = await fetch(`/projects/search?keyword=${encodeURIComponent(keyword)}`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Search results:', data);
      renderResults(data);
    } catch (error) {
      console.error('Search error:', error);
      searchResults.innerHTML = '<p class="text-danger">검색 중 오류가 발생했습니다.</p>';
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      console.log(`Keyword input: ${e.target.value}`);
    });

    searchInput.addEventListener('input', debounce((e) => {
      performSearch(e.target.value);
    }, 300));
  }

  if (dueDateInput) {
    dueDateInput.addEventListener('input', (e) => {
      console.log(`Due date input: ${e.target.value} (not implemented)`);
    });
  }

  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const keyword = searchInput.value;
      console.log(`Search form submitted with keyword: ${keyword}`);
      performSearch(keyword);
    });
  }

  const searchModal = document.getElementById('searchModal');
  if (searchModal) {
    searchModal.addEventListener('shown.bs.modal', () => {
      setTimeout(() => {
        searchInput.focus();
        console.log('Search modal shown, focused on searchInput');
      }, 50);
      searchInput.value = '';
      searchResults.innerHTML = '<p class="text-muted">키워드를 입력하세요.</p>';
    });
  }
});