'use client';

// components/Emblema.jsx — o quadrado que identifica um clube ou um escalão.
//
// Havia dois destes, escritos à mão em sítios diferentes, cada um com a sua
// cópia da função que tira as iniciais do nome. Agora há um, e é ele que sabe
// que passou a poder ter foto.
//
// Quando não há foto continua a mostrar as iniciais sobre a cor do clube — que
// é o que já fazia e funciona bem. A foto é um extra, não um requisito: ninguém
// tem de arranjar um ficheiro para começar a usar a app.

/** As duas primeiras iniciais de um nome. "CD Ribeira Alta" → "CR". */
export function iniciais(nome) {
  return String(nome || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export default function Emblema({ nome, foto, cor = '#22c55e', tamanho = 46 }) {
  const estilo = { width: tamanho, height: tamanho };

  if (foto) {
    return (
      <img
        className="club-card__crest club-card__crest--foto"
        src={foto}
        // Descritivo e não decorativo: em muitos sítios este quadrado é a única
        // coisa que distingue um escalão do seguinte.
        alt={nome || ''}
        style={estilo}
      />
    );
  }

  return (
    <div className="club-card__crest" style={{ ...estilo, background: cor }}>
      {iniciais(nome)}
    </div>
  );
}
