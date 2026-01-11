export function initUIControls(map) {
  // ------------------------------
  // スライドメニューの制御
  // ------------------------------

  // --- DOMと変数 ---
  const menu = document.querySelector('.menu');
  const toggleBtn = document.querySelector('.toggleBtn');
  const closeBtn = document.querySelector('.closeBtn');
  let menuOpen = false;

  // --- イベントリスナー ---
  toggleBtn.addEventListener('click', () => {
    menuOpen = !menuOpen;
    menu.classList.toggle('open', menuOpen);
    toggleBtn.style.display = menuOpen ? 'none' : 'block';
  });

  closeBtn.addEventListener('click', () => {
    menuOpen = false;
    menu.classList.remove('open');
    toggleBtn.style.display = 'block';
  });

  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
        header.classList.toggle('active');
        const content = header.nextElementSibling;
        content.classList.toggle('show');
    });
  });

}