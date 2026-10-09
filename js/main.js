const nav = document.getElementById("nav");
const toggle = nav.querySelector(".nav__toggle");

// Mobile menu toggle
toggle.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  toggle.setAttribute("aria-expanded", open);
});

nav.querySelectorAll(".nav__links a").forEach((link) =>
  link.addEventListener("click", () => {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  })
);

// Lazy-load project videos and only play them while visible
const player = new IntersectionObserver(
  (entries) => {
    entries.forEach(({ target: video, isIntersecting }) => {
      if (isIntersecting) {
        if (!video.src) video.src = video.dataset.src;
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  },
  { threshold: 0.35 }
);
document.querySelectorAll("video[data-src]").forEach((v) => player.observe(v));

// Highlight the nav link for the section in view
const links = [...nav.querySelectorAll('.nav__links a[href^="#"]')];
const spy = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((a) =>
        a.classList.toggle("active", a.getAttribute("href") === `#${entry.target.id}`)
      );
    });
  },
  { rootMargin: "-45% 0px -50% 0px" }
);
document.querySelectorAll("section[id]").forEach((s) => spy.observe(s));

document.getElementById("year").textContent = new Date().getFullYear();

// Contact form: send in the background via FormSubmit's AJAX endpoint so visitors stay on the page.
// Without JS the form still works and opens FormSubmit's confirmation in a new tab.
const form = document.getElementById("contact-form");
const status = form.querySelector(".form__status");
const submit = form.querySelector('button[type="submit"]');

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  submit.disabled = true;
  status.className = "form__status";
  status.textContent = "Sending…";
  try {
    const res = await fetch(form.action.replace("formsubmit.co/", "formsubmit.co/ajax/"), {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new FormData(form),
    });
    const data = await res.json();
    if (!res.ok || String(data.success) !== "true") throw new Error(data.message);
    form.reset();
    status.classList.add("is-success");
    status.textContent = "Thanks! Your message is on its way. I'll get back to you soon.";
  } catch {
    status.classList.add("is-error");
    status.innerHTML = 'Something went wrong. Please email me at <a href="mailto:pattasiwa@gmail.com">pattasiwa@gmail.com</a>.';
  } finally {
    submit.disabled = false;
  }
});
