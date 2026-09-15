// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href !== '#' && document.querySelector(href)) {
            e.preventDefault();
            document.querySelector(href).scrollIntoView({
                behavior: 'smooth'
            });
        }
    });
});

// Add click handlers to buttons
document.querySelectorAll('.btn-play').forEach(button => {
    button.addEventListener('click', function() {
        alert('Welcome to the game! This is a demo version.');
    });
});

document.querySelector('.btn-primary')?.addEventListener('click', function() {
    alert('Redirecting to sign up...');
});

document.querySelector('.btn-signup')?.addEventListener('click', function() {
    alert('Redirecting to sign up...');
});

document.querySelector('.btn-login')?.addEventListener('click', function() {
    alert('Redirecting to login...');
});

// Contact form submission
const contactForm = document.querySelector('.contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        alert('Thank you for your message! We will get back to you soon.');
        this.reset();
    });
}

// Add animation to elements on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all game cards and feature cards
document.querySelectorAll('.game-card, .feature').forEach(element => {
    element.style.opacity = '0';
    element.style.transform = 'translateY(20px)';
    element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(element);
});

// Animate hero content on load
window.addEventListener('load', function() {
    const heroContent = document.querySelector('.hero-content');
    if (heroContent) {
        heroContent.style.animation = 'fadeInUp 0.8s ease';
    }
});

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(30px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;
document.head.appendChild(style);

// Bonus claim button
const bonusButton = document.querySelector('.btn-primary-large');
if (bonusButton) {
    bonusButton.addEventListener('click', function() {
        alert('Thank you for claiming your bonus! Please sign up to receive your 100% welcome bonus.');
    });
}

console.log('Lucky Jackpot website loaded successfully!');