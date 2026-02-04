/* ui.js - Modern UI Effects */
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Mouse Glow Effect on Cards
    const handleMouseMove = (e) => {
        document.querySelectorAll('.card').forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--x', `${x}px`);
            card.style.setProperty('--y', `${y}px`);
        });
    };
    window.addEventListener('mousemove', handleMouseMove);

    // 2. Mobile Sidebar Logic
    const mobileMenuTrigger = document.getElementById('mobile-menu-trigger');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    if(mobileMenuTrigger) {
        mobileMenuTrigger.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            overlay.classList.toggle('active');
        });
    }

    if(overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
            
            // Close other modals if open
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
            const editor = document.getElementById('editor-side');
            if(editor) editor.classList.remove('active');
        });
    }
});