(function () {
    const SCROLL_OFFSET = 64;

    document.addEventListener('DOMContentLoaded', () => {
        const body = document.body;
        const isLoggedIn = body.dataset.loggedIn === 'true';
        const streamUrl = body.dataset.streamUrl || '/stream';
        const loginUrl = body.dataset.loginUrl || '/login';

        setupViewStreamButton({ isLoggedIn, streamUrl, loginUrl });
        setupSidebar();
        setupSmoothScroll();
        setupScrollTopButton();
        setupScrollAnimations();
        initializeFlashMessages();
    });

    window.addEventListener('beforeunload', cleanupFlashMessageTimers);

    function setupViewStreamButton({ isLoggedIn, streamUrl, loginUrl }) {
        const viewStreamBtn = document.querySelector('[data-action="view-stream"]');
        if (!viewStreamBtn) return;

        viewStreamBtn.addEventListener('click', () => {
            window.location.href = isLoggedIn ? streamUrl : loginUrl;
        });
    }

    function setupSidebar() {
        const toggleElements = document.querySelectorAll('[data-action="toggle-sidebar"]');
        const closeElements = document.querySelectorAll('[data-action="close-sidebar"], [data-close-sidebar="true"]');

        toggleElements.forEach(element => {
            element.addEventListener('click', event => {
                event.preventDefault();
                toggleSidebar();
            });
        });

        closeElements.forEach(element => {
            element.addEventListener('click', () => toggleSidebar(false));
        });
    }

    function toggleSidebar(forceState) {
        const sidebar = document.getElementById('mobileSidebar');
        const overlay = document.getElementById('mobileOverlay');
        if (!sidebar || !overlay) return;

        let shouldOpen = forceState;
        if (typeof shouldOpen !== 'boolean') {
            shouldOpen = !sidebar.classList.contains('active');
        }

        sidebar.classList.toggle('active', shouldOpen);
        overlay.classList.toggle('active', shouldOpen);
    }

    function setupSmoothScroll() {
        const anchors = document.querySelectorAll('a[href^="#"]');
        anchors.forEach(anchor => {
            anchor.addEventListener('click', event => {
                const targetSelector = anchor.getAttribute('href');
                if (!targetSelector || targetSelector === '#') return;

                const target = document.querySelector(targetSelector);
                if (!target) return;

                event.preventDefault();
                const offsetTop = target.offsetTop - SCROLL_OFFSET;
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            });
        });
    }

    function setupScrollTopButton() {
        const scrollTopBtn = document.getElementById('scrollTopBtn');
        if (!scrollTopBtn) return;

        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                scrollTopBtn.classList.add('visible');
            } else {
                scrollTopBtn.classList.remove('visible');
            }
        });

        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    function setupScrollAnimations() {
        const animatedElements = document.querySelectorAll('.scroll-animate');
        if (!animatedElements.length || !('IntersectionObserver' in window)) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                } else {
                    entry.target.classList.remove('animate-in');
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        animatedElements.forEach(el => observer.observe(el));
    }

    function initializeFlashMessages() {
        const flashMessages = document.querySelectorAll('.flash-message:not([data-initialized])');
        flashMessages.forEach(message => {
            message.dataset.initialized = 'true';

            const startTimer = () => window.setTimeout(() => dismissFlashMessage(message), 5000);
            let dismissTimer = startTimer();
            message.dataset.dismissTimer = dismissTimer;

            const closeBtn = message.querySelector('.flash-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', event => {
                    event.preventDefault();
                    clearTimeout(dismissTimer);
                    dismissFlashMessage(message);
                });
            }

            message.addEventListener('mouseenter', () => {
                clearTimeout(dismissTimer);
            });

            message.addEventListener('mouseleave', () => {
                dismissTimer = startTimer();
                message.dataset.dismissTimer = dismissTimer;
            });
        });
    }

    function dismissFlashMessage(message) {
        message.style.animation = 'slideOutRight 0.3s ease-in forwards';
        window.setTimeout(() => {
            if (message.parentNode) {
                message.remove();
            }
        }, 300);
    }

    function cleanupFlashMessageTimers() {
        document.querySelectorAll('.flash-message').forEach(message => {
            const timerId = message.dataset.dismissTimer;
            if (timerId) {
                clearTimeout(Number(timerId));
            }
        });
    }
})();

