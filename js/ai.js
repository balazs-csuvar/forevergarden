// Optional Claude features: identify a plant from a close-up, find plants in a garden photo,
// and suggest plants beyond the built-in catalogue. Uses the person's own API key, stored on device.
const MODEL = "claude-opus-5-5";
let sdkPromise;

async function getClient(apiKey) {
  if (!apiKey) throw new Error("Add your Claude API key in Settings to use this.");
  sdkPromise ||= import("https://esm.sh/@anthropic-ai/sdk");
  const { default: Anthropic } = await sdkPromise;
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

const MONTH_INT = { type: "integer", description: "Month index, 0 = January … 11 = December" };
const SPECIES_PROPS = {
  name: { type: "string", description: "Common name as used by UK nurseries, with cultivar in single quotes if known" },
  latin: { type: "string" },
  type: { type: "string", description: "e.g. Perennial, Shrub, Small tree, Climber, Grass, Bulb, Fern" },
  habit: { type: "string", enum: ["evergreen", "semi", "deciduous", "herbaceous", "bulb"] },
  form: { type: "string", enum: ["mound", "upright", "airy", "spire", "spiky", "grass", "ground", "fern", "tree", "column", "ball", "climber", "bulbs"] },
  h: { type: "number", description: "Typical mature height in metres" },
  s: { type: "number", description: "Typical mature spread in metres" },
  rhs: { type: "integer", description: "RHS hardiness rating number, 1-7" },
  sun: { type: "array", items: { type: "string", enum: ["full", "part", "shade"] } },
  soil: { type: "array", items: { type: "string", enum: ["clay", "loam", "sand", "chalk"] } },
  moist: { type: "array", items: { type: "string", enum: ["dry", "moist", "wet"] } },
  bloom: { type: "array", items: MONTH_INT, description: "Months in flower in the UK" },
  flower: { type: "string", description: "Flower colour as #rrggbb, or empty string if not ornamental" },
  foliage: { type: "string", description: "Summer foliage colour as #rrggbb" },
  autumn: { type: "string", description: "Autumn foliage colour as #rrggbb, or empty string" },
  note: { type: "string", description: "One or two sentences of practical, specific advice" }
};
const SPECIES_REQUIRED = Object.keys(SPECIES_PROPS);
const speciesSchema = (extra = {}) => ({
  type: "object",
  additionalProperties: false,
  properties: { ...SPECIES_PROPS, ...extra },
  required: [...SPECIES_REQUIRED, ...Object.keys(extra)]
});

const SYSTEM = `You are an experienced UK garden designer and horticulturist helping one person plan their own garden.
Be accurate rather than generic: use RHS hardiness ratings and UK flowering times, prefer plants sold by UK nurseries,
and say when you are unsure. Colours must be realistic hex values because they are used to paint the plant in a watercolour.`;

async function ask(apiKey, { schema, content, effort = "medium" }) {
  const client = await getClient(apiKey);
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort, format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }]
  });
  if (response.stop_reason === "refusal") throw new Error("Claude couldn't help with that request.");
  if (response.stop_reason === "max_tokens") throw new Error("The answer was cut short. Try again.");
  const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("");
  return JSON.parse(text);
}

const imageBlock = (base64) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } });

export async function identifyPlant(apiKey, base64, context) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      candidates: { type: "array", items: speciesSchema({ confidence: { type: "string", enum: ["high", "medium", "low"] }, clues: { type: "string", description: "What in the photo supports this identification" } }) },
      tip: { type: "string", description: "What extra photo (flower, leaf underside, bark) would confirm the ID, or empty string" }
    },
    required: ["candidates", "tip"]
  };
  return ask(apiKey, {
    schema,
    content: [imageBlock(base64), { type: "text", text: `Identify this plant growing in my garden (${context}). Give up to 3 candidates, most likely first, with accurate growing data for each.` }]
  });
}

export async function scanGardenPhoto(apiKey, base64, context) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      plants: { type: "array", items: speciesSchema({
        x: { type: "number", description: "Horizontal centre of the plant in the image, 0 = left edge, 1 = right edge" },
        y: { type: "number", description: "Vertical centre of the plant in the image, 0 = top, 1 = bottom" },
        r: { type: "number", description: "Approximate radius of the plant as a fraction of image width" },
        confidence: { type: "string", enum: ["high", "medium", "low"] }
      }) },
      areas: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        name: { type: "string" }, x: { type: "number" }, y: { type: "number" },
        light: { type: "string", enum: ["full", "part", "shade"] }, moist: { type: "string", enum: ["dry", "moist", "wet"] },
        note: { type: "string" }
      }, required: ["name", "x", "y", "light", "moist", "note"] } }
    },
    required: ["plants", "areas"]
  };
  return ask(apiKey, {
    schema,
    effort: "high",
    content: [imageBlock(base64), { type: "text", text: `This is a view of my garden (${context}). List each distinct plant or plant group you can see with its position in the image and your best identification, and divide the view into plantable areas (borders, beds, shady corners) with their likely light and moisture. Skip lawn, paving and structures.` }]
  });
}

export async function suggestPlants(apiKey, brief) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { ideas: { type: "array", items: speciesSchema({ why: { type: "string", description: "Why this plant suits this exact spot and this garden" } }) } },
    required: ["ideas"]
  };
  return ask(apiKey, { schema, effort: "high", content: [{ type: "text", text: brief }] });
}

export async function fileToBase64Jpeg(blob, maxSize = 1280, quality = 0.85) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality).split(",")[1];
}
