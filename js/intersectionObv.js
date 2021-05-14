const faders = document.querySelectorAll('.fade-in')


const appearOptions = {
    threshold: .5,
}


const appearOnScroll = new IntersectionObserver((entries, appearOnScroll) => {
    entries.forEach(entry => {
        if (!entry.isIntersecting) {
            return
        } else {
            entry.target.classList.add('appear')
            appearOnScroll.unobserve(entry.target)
        }
    })
}, appearOptions)

faders.forEach(fader => {
    appearOnScroll.observe(fader)
})