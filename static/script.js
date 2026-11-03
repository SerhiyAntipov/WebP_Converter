const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");

const quality = document.getElementById("quality");
const qualityValue = document.getElementById("qualityValue");

const imgWrapper = document.getElementById("imgWrapper");
const status = document.getElementById("status");
const downloadLink = document.getElementById("downloadLink");
let currentImageUrl = null;
let currentWebpUrl = null;
let selectedImage = null;

function convertImage() {
  if (!selectedImage) return;

  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob || blob.type !== "image/webp") {
        status.textContent = "Не вдалося створити WebP у цьому браузері.";
        downloadLink.hidden = true;
        return;
      }

      if (currentWebpUrl) URL.revokeObjectURL(currentWebpUrl);
      currentWebpUrl = URL.createObjectURL(blob);
      downloadLink.href = currentWebpUrl;
      downloadLink.hidden = false;
      const outputSize = formatFileSize(blob.size);
      const originalSize = formatFileSize(selectedImage.size);
      const originalFormat = getFileFormat(selectedImage);
      const savings = ((selectedImage.size - blob.size) / selectedImage.size) * 100;
      const sizeChange = savings >= 0
        ? `Економія: ${savings.toFixed(1)}%.`
        : `Розмір збільшився на ${Math.abs(savings).toFixed(1)}%.`;
      status.textContent = `Готово. Розмір ${originalFormat}: ${originalSize}. Розмір WebP: ${outputSize}. ${sizeChange}`;
    }, "image/webp", Number(quality.value) / 100);
  };
  image.onerror = () => {
    status.textContent = "Не вдалося завантажити це зображення.";
  };
  image.src = currentImageUrl;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

function getFileFormat(file) {
  if (file.type === "image/jpeg") return "JPG";

  const extension = file.name.split(".").pop();
  return extension && extension !== file.name ? extension.toUpperCase() : "оригіналу";
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    fileInput.value = "";
    status.textContent = "Будь ласка, виберіть файл зображення.";
    return;
  }

  if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
  if (currentWebpUrl) URL.revokeObjectURL(currentWebpUrl);
  currentImageUrl = URL.createObjectURL(file);
  currentWebpUrl = null;
  selectedImage = file;
  downloadLink.hidden = true;
  status.textContent = "Конвертуємо зображення…";
  preview.src = currentImageUrl;
  imgWrapper.hidden = false;
  convertImage();
});

quality.addEventListener("input", () => {
  qualityValue.textContent = quality.value;
  if (selectedImage) {
    status.textContent = "Конвертуємо зображення…";
    downloadLink.hidden = true;
    convertImage();
  }
});

window.addEventListener("beforeunload", () => {
  if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
  if (currentWebpUrl) URL.revokeObjectURL(currentWebpUrl);
});
