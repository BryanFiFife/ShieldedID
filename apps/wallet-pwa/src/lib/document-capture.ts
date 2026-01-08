export interface OCRResult {
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  documentType: string;
  issuer: string;
  issuedDate: string;
  expiryDate: string;
}

let cachedRecognizer: any = null;
let mediapipeAvailable = false;

// Check if MediaPipe models are available (gated)
async function checkMediaPipeAvailable(): Promise<boolean> {
  if (mediapipeAvailable) return true;
  try {
    const resp = await fetch("/models/text-recognizer.task", { method: "HEAD" });
    mediapipeAvailable = resp.ok;
    return mediapipeAvailable;
  } catch {
    return false;
  }
}

async function getRecognizer() {
  if (cachedRecognizer) return cachedRecognizer;
  try {
    const available = await checkMediaPipeAvailable();
    if (!available) {
      throw new Error("MEDIAPIPE_MODELS_NOT_FOUND");
    }
    // Dynamically import MediaPipe only if models exist
    const { FilesetResolver, TextRecognizer } = await import("@mediapipe/tasks-vision");
    const wasmBaseUrl = "/mediapipe";
    const modelPath = "/models/text-recognizer.task";
    const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl);
    cachedRecognizer = await TextRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelPath
      }
    });
    return cachedRecognizer;
  } catch (err) {
    console.warn("[OCR] MediaPipe initialization failed:", err);
    return null;
  }
}

export async function captureDocumentImage(
  camera: HTMLVideoElement,
  _side: "front" | "back"
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = camera.videoWidth;
  canvas.height = camera.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("CANVAS_NOT_AVAILABLE");
  }
  ctx.drawImage(camera, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("CAPTURE_FAILED"));
        } else {
          resolve(blob);
        }
      },
      "image/jpeg",
      0.92
    );
  });
}

function parseFieldsSimple(text: string): OCRResult {
  const upper = text.toUpperCase();
  const dobMatch = upper.match(/DOB[:\s]*([0-9\-\/]{6,10})/);
  const expMatch = upper.match(/EXP[:\s]*([0-9\-\/]{6,10})/);
  const issueMatch = upper.match(/ISSUED[:\s]*([0-9\-\/]{6,10})/);
  const nameMatch = upper.match(/NAME[:\s]*([A-Z\s]+)/);

  return {
    givenName: nameMatch?.[1]?.split(" ")[1] ?? "",
    familyName: nameMatch?.[1]?.split(" ")[0] ?? "",
    dateOfBirth: dobMatch?.[1] ?? "",
    documentType: upper.includes("PASSPORT") ? "PASSPORT" : "ID",
    issuer: upper.includes("USA") ? "USA" : "",
    issuedDate: issueMatch?.[1] ?? "",
    expiryDate: expMatch?.[1] ?? ""
  };
}

export async function performOCR(imageBlob: Blob): Promise<OCRResult> {
  // Validate image size (max 5MB)
  if (imageBlob.size > 5 * 1024 * 1024) {
    throw new Error("IMAGE_TOO_LARGE");
  }

  // Validate image type
  if (!imageBlob.type.startsWith("image/")) {
    throw new Error("INVALID_IMAGE_TYPE");
  }

  try {
    const imageBitmap = await createImageBitmap(imageBlob);
    const canvas = document.createElement("canvas");
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("CANVAS_NOT_AVAILABLE");
    }
    ctx.drawImage(imageBitmap, 0, 0);

    const recognizer = await getRecognizer();
    if (!recognizer) {
      // Fallback: return empty result; UI should ask user to fill manually
      console.warn("[OCR] No recognizer available; using fallback");
      return {
        givenName: "",
        familyName: "",
        dateOfBirth: "",
        documentType: "",
        issuer: "",
        issuedDate: "",
        expiryDate: ""
      };
    }
    const text = result.text ?? "";
    return parseFieldsSimple(text);
  } catch (err) {
    console.error("[OCR] Recognition failed:", err);
    // Return empty; UI must ask user to fill fields manually
    return {
      givenName: "",
      familyName: "",
      dateOfBirth: "",
      documentType: "",
      issuer: "",
      issuedDate: "",
      expiryDate: ""
    };
  }
}

export function normalizeAttribute(value: string, type: string): string {
  if (!value) return "";
  if (type === "givenName" || type === "familyName") {
    return value.trim().toUpperCase();
  }
  if (type.toLowerCase().includes("date")) {
    const digits = value.replace(/[^0-9]/g, "");
    if (digits.length >= 8) {
      const year = digits.slice(0, 4);
      const month = digits.slice(4, 6);
      const day = digits.slice(6, 8);
      return `${year}-${month}-${day}`;
    }
  }
  return value.trim();
}
