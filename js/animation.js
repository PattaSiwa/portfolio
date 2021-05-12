const timeline = gsap.timeline({ defaults: { ease: 'power1.out' } })

timeline.to('.text', { x: '0%', duration: .1, stagger: 0.5 })
timeline.to('.slider', { y: "-100%", duration: .17, delay: 0.6 })
timeline.to('.intro', { x: "-100%", duration: .1 }, "-=.9")
timeline.fromTo('header', { opacity: 0 }, { opacity: 1, duration: .15 })
timeline.fromTo('.title-text', { opacity: 0 }, { opacity: 1, duration: .1 }, "-=1.5")