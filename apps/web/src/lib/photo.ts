// Converte um arquivo de imagem em um data URL quadrado e leve (para foto de perfil).
// Recorta no centro e redimensiona no navegador, evitando guardar imagens grandes.
export async function fileToAvatarDataURL(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const srcSide = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - srcSide) / 2;
  const sy = (bitmap.height - srcSide) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível');
  ctx.drawImage(bitmap, sx, sy, srcSide, srcSide, 0, 0, size, size);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.82);
}
