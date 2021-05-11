const timeline = gsap.timeline({ defaults: { ease: 'power1.out' } })

timeline.to('.text', { x: '0%', duration: 1, stagger: 0.2 })
timeline.to('.slider', { y: "-100%", duration: 1.7, delay: 0.6 })
timeline.to('.intro', { y: "-100%", duration: 1 }, "-=.9")