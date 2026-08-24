/* ---------------------------------------------------------------------------
   THIS IS THE ONLY FILE YOU NEED TO EDIT TO RUN THE STORE.
   Add a character = add an object to CHARACTERS below.
   See store/README.md for the full checklist.
--------------------------------------------------------------------------- */

const SITE = {
  name: "CONDOR CROWNS",
  headline: "Game-ready 3D characters.",
  tagline: "Rigged, UV'd, and dropped straight into your engine — Unity, Unreal, or Godot.",
  // Shown in the footer and on the "custom work" call to action.
  contactEmail: "condorcrowns@gmail.com",
  // Text burned into preview renders by tools/watermark.py — keep the two in sync.
  watermarkText: "CONDOR CROWNS — PREVIEW",
  // Where "browse everything" points if you also list on a marketplace.
  marketplaceUrl: "",
  currency: "USD",
  currencySymbol: "$",
};

/* Free checkout options — put the product URL in `buyUrl` on each character:
     itch.io      — you choose the revenue share (can be 0%), free to list
     Ko-fi Shop   — 0% platform fee on the free plan
     Payhip       — free plan, 5% per sale
     Gumroad      — no monthly fee, ~10% per sale
     mailto:      — invoice and deliver manually, zero fees
   None of these charge a monthly subscription. Swap the URL any time. */

const CHARACTERS = [
  {
    // ---- EXAMPLE ENTRY -----------------------------------------------------
    // Delete this whole object once you add a real character.
    id: "example-ronin",
    name: "Example Character",
    tagline: "A placeholder entry showing every field the store supports.",
    description:
      "Replace this object in store/js/data.js with your own character. " +
      "Everything you see on this page is driven by the fields below — there is " +
      "no CMS, no database, and no server to keep running.",

    category: "sci-fi",        // powers the category filter
    style: "stylized",         // powers the style filter
    tags: ["humanoid", "rigged", "pbr"],

    price: 29,                 // 0 renders as "Free"; null renders as "Enquire"
    buyUrl: "",                // itch.io / Ko-fi / Payhip / Gumroad / mailto: link
    status: "coming-soon",     // available | coming-soon | sold-exclusive

    // --- Preview media. NEVER point these at your master files. -------------
    // Renders must be watermark-burned by tools/watermark.py before committing.
    thumb: "",                 // e.g. assets/characters/example-ronin/thumb.webp
    gallery: [],               // e.g. [".../render-01.webp", ".../render-02.webp"]
    turntable: "",             // optional looping .mp4/.webm
    // Decimated + unrigged + watermark-textured GLB from tools/make_preview.py
    preview3d: "",

    specs: {
      tris: 24800,
      verts: 13100,
      rigged: true,
      skeleton: "Humanoid — UE5 & Mixamo compatible",
      textures: "4K PBR — BaseColor, Normal, ORM",
      uvs: "Non-overlapping, single UV set",
      scale: "Real-world, 1 unit = 1 m",
      pose: "A-pose",
      lods: "LOD0–LOD2",
    },

    formats: ["FBX", "GLB", "OBJ", "BLEND"],

    includes: [
      "Rigged & skinned mesh (FBX + GLB)",
      "4K PBR texture set (PNG)",
      "Source .blend file",
      "LOD0–LOD2 meshes",
      "Commercial-use licence",
    ],
  },
];
