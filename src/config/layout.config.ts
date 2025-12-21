// === LAYOUT CONFIGURATION GUIDE ===
// Use this file to fine-tune the Conversation Card visuals.
//
// 1. SPRITES (charA, charB):
//    - `bottom`: Controls vertical height. Higher % = moves HEAD UP (creates gap with text).
//    - `left`/`right`: Controls horizontal position. Negative % (e.g. -15%) pushes them OFF SCREEN to hide edges.
//    - `rotation`: Rotates the image (degrees). Use 45/-45 to Angle them inward and hide flat edges.
//
// 2. DIALOGUE (Text Bubble):
//    - `paddingTop`: The "Ceiling". Controls where text STARTS. Higher value (e.g. 40vh) = starts LOWER (near heads).
//    - `paddingX`: Side padding. Higher % = narrower text box (more centered).
//    - `paddingBottom`: Spacer at bottom to prevent text hitting the screen edge.

export const LAYOUT_CONFIG = {
    base: {
        // === MOBILE / DEFAULT ===

        // LEFT CHARACTER
        charA: {
            bottom: "-35%",
            offsetFromText: "-220px", // Closer pinning
            left: "-7%",
            width: "45%",
            height: "55%",
            rotation: 0
        },

        // RIGHT CHARACTER
        charB: {
            bottom: "-55%",
            offsetFromText: "-220px",
            right: "-5%",
            width: "45%",
            height: "55%",
            rotation: -0
        },

        // SENSEI
        guide: { top: 150, right: -60, size: 160 },
        guideBubble: { top: 120, right: 160, width: 280 }, // Independent bubble position

        // TEXT BUBBLE
        dialogue: {
            paddingBottom: "240px",
            paddingTop: "55vh",
            paddingX: "15%"
        }
    },
    desktop: {
        // === DESKTOP / LARGE SCREENS ===
        charA: { bottom: "-5%", offsetFromText: "-140px", left: "5%", width: "35%", height: "65%", rotation: 0 },
        charB: { bottom: "-5%", offsetFromText: "-140px", right: "5%", width: "35%", height: "65%", rotation: 0 },
        guide: { top: 80, right: "5%", size: 200 },
        guideBubble: { top: 80, right: "20%", width: 300 },
        dialogue: { paddingBottom: "160px", paddingTop: "30vh", paddingX: "25%" }
    }
} as const;
