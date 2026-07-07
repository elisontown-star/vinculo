// Identidade visual da Ana Luiza.
// Para usar o rosto dela, cole a URL da imagem hospedada abaixo (formato quadrado,
// rosto centralizado). Enquanto estiver vazio, mostramos o emoji ✨ como fallback.
export const ANA_AVATAR = 'https://i.postimg.cc/sgcXdnCV/Whats-App-Image-2026-07-07-at-9-19-47-AM.jpg';

// Componente que mostra o rosto da Ana (ou o emoji, se ainda não houver imagem).
export function AnaFace({ className = '' }: { className?: string }) {
  if (ANA_AVATAR) {
    return <img src={ANA_AVATAR} alt="Ana Luiza" className={`ana-face ${className}`} />;
  }
  return <span className={`ana-face-emoji ${className}`}>✨</span>;
}
