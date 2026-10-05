/** Etiqueta de 80 mm (largura) x 100 mm (altura) a 203 dpi (8 pontos por mm). */
export const DOTS_PER_MM = 8;
export const LABEL_WIDTH_MM = 80;
export const LABEL_HEIGHT_MM = 100;
export const WIDTH = LABEL_WIDTH_MM * DOTS_PER_MM; // 640
export const HEIGHT = LABEL_HEIGHT_MM * DOTS_PER_MM; // 800
/** Margem de segurança: a térmica perde as bordas, então nada é impresso fora dela. */
export const MARGIN = 36;
