import { config } from "./config.mjs";

const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const clamp = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => 1 - (1 - clamp(value)) ** 3;

/** Editable HTML composition. Its clock is an explicit frame number, never wall time. */
export function composition({
  kind,
  scene,
  frame = 0,
  logo,
  screenshot,
  final = false,
}) {
  const {
    colors: c,
    typography: type,
    frame: rect,
    titleAnimation: animation,
  } = config;
  const time = frame / config.fps;
  const reveal = (delay) =>
    final ? 1 : ease((time - delay) / animation.revealSeconds);
  const motion = (value) =>
    `opacity:${value};transform:translateY(${animation.travel * (1 - value)}px)`;
  const logoProgress = reveal(animation.logoDelay);
  const titleProgress = reveal(animation.textDelay);
  const subtitleProgress = reveal(animation.subtitleDelay);
  let content;
  if (kind === "ui") {
    content = `<div class="scene-title"><i></i>${escape(scene.title)}</div><div class="demo top">${escape(config.texts.demo)}</div><div class="ui-frame"></div>`;
  } else if (kind === "poster") {
    content = `<div class="poster-copy"><img class="poster-logo" src="${logo}" alt=""><div class="poster-accent"></div><h1>${escape(config.texts.brand).replace(" ", "<br>")}</h1><p>${escape(config.texts.subtitle)}</p></div><div class="poster-screen"><img src="${screenshot}" alt="Interfaz real de demostración"></div><div class="demo bottom">${escape(config.texts.demo)}</div>`;
  } else {
    const closing = scene.id === "outro";
    content = `<div class="lockup"><img src="${logo}" alt="" style="${motion(logoProgress)}"><div class="brand-copy"><div class="brand-accent" style="${motion(titleProgress)}"></div><h1 style="${motion(titleProgress)}">${escape(config.texts.brand)}</h1><p style="${motion(subtitleProgress)}">${escape(closing ? config.texts.closing : config.texts.subtitle)}</p></div></div><div class="demo bottom">${escape(config.texts.demo)}</div>`;
  }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:${config.width}px;height:${config.height}px;overflow:hidden}
    body{font-family:${type.family};color:${c.ink};background:linear-gradient(135deg,#fbfbf9 0%,${c.background} 70%);-webkit-font-smoothing:antialiased}
    h1,p{margin:0}h1{font-size:${type.title}px;line-height:1.05;letter-spacing:-.035em;font-weight:650}
    .lockup{position:absolute;left:280px;top:392px;display:flex;align-items:center;gap:58px;width:1360px}
    .lockup>img{width:166px;height:166px;object-fit:contain;mix-blend-mode:multiply}
    .brand-copy{flex:1}.brand-copy p{font-size:${type.subtitle}px;line-height:1.4;color:${c.muted};margin-top:22px;letter-spacing:-.015em}
    .brand-accent{height:3px;width:70px;background:${c.accent};margin-bottom:24px}
    .demo{font-size:${type.demo}px;letter-spacing:.08em;font-weight:600;color:${c.muted}}
    .bottom{position:absolute;bottom:84px;left:160px}.top{position:absolute;top:88px;right:160px}
    .scene-title{position:absolute;top:70px;left:${rect.x}px;display:flex;gap:18px;align-items:center;font-size:${type.label}px;font-weight:600;letter-spacing:-.015em;line-height:48px}
    .scene-title i{display:block;height:25px;width:3px;background:${c.accent}}
    .ui-frame{position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;border-radius:${rect.radius}px;background:white;box-shadow:0 12px 34px #191b1e13,0 0 0 1px #191b1e12}
    .poster-copy{position:absolute;left:150px;top:194px;width:590px}.poster-logo{width:140px;height:140px;object-fit:contain;mix-blend-mode:multiply}
    .poster-accent{width:64px;height:3px;background:${c.accent};margin-top:34px;margin-bottom:31px}.poster-copy h1{font-size:78px;line-height:1.04;letter-spacing:-.035em}
    .poster-copy p{font-size:35px;line-height:1.4;color:${c.muted};margin-top:25px;max-width:530px}
    .poster-screen{position:absolute;left:850px;top:300px;width:920px;height:517.5px;overflow:hidden;border-radius:18px;border:1px solid ${c.border};box-shadow:0 24px 68px #191b1e1d}
    .poster-screen img{display:block;width:100%;height:100%;object-fit:contain}
  </style></head><body>${content}</body></html>`;
}

export function maskComposition() {
  const rect = config.frame;
  return `<!doctype html><html><style>*{box-sizing:border-box}html,body{margin:0;background:black;width:${rect.width}px;height:${rect.height}px}div{width:100%;height:100%;background:white;border-radius:${rect.radius}px}</style><body><div></div></body></html>`;
}
