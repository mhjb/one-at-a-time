const DEFAULTS = {
  autostart: true,
  bgType: "default", // "default" | "color" | "image"
  bgColor: "#0f1419",
  bgImage: "", // URL or data: URL
};

const el = (id) => document.getElementById(id);
const autostart = el("autostart");
const bgcolor = el("bgcolor");
const bgcolorVal = el("bgcolor-val");
const bgurl = el("bgurl");
const bgfile = el("bgfile");
const bgimgStatus = el("bgimg-status");

function showFields(type) {
  el("field-color").classList.toggle("show", type === "color");
  el("field-image").classList.toggle("show", type === "image");
}

function selectedType() {
  const r = document.querySelector('input[name="bgtype"]:checked');
  return r ? r.value : "default";
}

// Load current settings.
chrome.storage.local.get(DEFAULTS, (cfg) => {
  autostart.checked = cfg.autostart;
  bgcolor.value = cfg.bgColor || "#0f1419";
  bgcolorVal.textContent = bgcolor.value;
  bgurl.value = cfg.bgImage && !cfg.bgImage.startsWith("data:") ? cfg.bgImage : "";
  if (cfg.bgImage && cfg.bgImage.startsWith("data:")) {
    bgimgStatus.textContent = "Uploaded image saved ✓";
  }
  const t = cfg.bgType || "default";
  const radio = document.querySelector(`input[name="bgtype"][value="${t}"]`);
  if (radio) radio.checked = true;
  showFields(t);
});

autostart.addEventListener("change", () => {
  chrome.storage.local.set({ autostart: autostart.checked });
});

document.querySelectorAll('input[name="bgtype"]').forEach((r) => {
  r.addEventListener("change", () => {
    const t = selectedType();
    showFields(t);
    chrome.storage.local.set({ bgType: t });
  });
});

bgcolor.addEventListener("input", () => {
  bgcolorVal.textContent = bgcolor.value;
  chrome.storage.local.set({ bgColor: bgcolor.value, bgType: "color" });
});

bgurl.addEventListener("change", () => {
  const url = bgurl.value.trim();
  chrome.storage.local.set({ bgImage: url, bgType: url ? "image" : "default" });
  bgimgStatus.textContent = url ? "Using image URL ✓" : "";
});

el("pickfile").addEventListener("click", (e) => {
  e.preventDefault();
  bgfile.click();
});

bgfile.addEventListener("change", () => {
  const file = bgfile.files && bgfile.files[0];
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) {
    bgimgStatus.textContent = "Image too large (max ~4 MB).";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    chrome.storage.local.set({ bgImage: reader.result, bgType: "image" });
    bgurl.value = "";
    bgimgStatus.textContent = "Uploaded image saved ✓";
  };
  reader.readAsDataURL(file);
});

el("reset").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.storage.local.set({ bgType: "default", bgImage: "" });
  const radio = document.querySelector('input[name="bgtype"][value="default"]');
  if (radio) radio.checked = true;
  showFields("default");
  bgurl.value = "";
  bgimgStatus.textContent = "";
});
