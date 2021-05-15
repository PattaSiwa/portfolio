const timeline = gsap.timeline({ defaults: { ease: 'power1.out' } })

timeline.to('.text', { x: '0%', duration: .9, delay: 1, stagger: .7 })
timeline.to('.slider', { y: "-100%", duration: 1.4, delay: 0.3 })
timeline.to('.intro', { x: "-100%", duration: .9 }, "-=.9")
timeline.fromTo('header', { opacity: 0 }, { opacity: 1, duration: 1.5 })
timeline.fromTo('.title-text', { opacity: 0 }, { opacity: 1, duration: 1 }, "-=1.5")