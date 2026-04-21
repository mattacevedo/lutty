/**
 * ASC CDL file serializers (.cc, .cdl, .ccc).
 */

import type { CdlNode } from './types';

function fmt(n: number): string {
  return n.toFixed(6);
}

function sopBlock(node: CdlNode): string {
  return `    <SOPNode>
      <Slope>${fmt(node.slope[0])} ${fmt(node.slope[1])} ${fmt(node.slope[2])}</Slope>
      <Offset>${fmt(node.offset[0])} ${fmt(node.offset[1])} ${fmt(node.offset[2])}</Offset>
      <Power>${fmt(node.power[0])} ${fmt(node.power[1])} ${fmt(node.power[2])}</Power>
    </SOPNode>`;
}

function satBlock(node: CdlNode): string {
  return `    <SatNode>
      <Saturation>${fmt(node.saturation)}</Saturation>
    </SatNode>`;
}

/** Serialize to .cc (single ColorCorrection) */
export function serializeCC(node: CdlNode): string {
  const id = node.id ? ` id="${node.id}"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<ColorCorrection${id}>
${sopBlock(node)}
${satBlock(node)}
</ColorCorrection>`;
}

/** Serialize to .cdl (ColorDecisionList with one ColorDecision) */
export function serializeCDL(node: CdlNode): string {
  const id = node.id ? ` id="${node.id}"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<ColorDecisionList xmlns="urn:ASC:CDL:v1.01">
  <ColorDecision>
    <ColorCorrection${id}>
${sopBlock(node)}
${satBlock(node)}
    </ColorCorrection>
  </ColorDecision>
</ColorDecisionList>`;
}

/** Serialize to .ccc (ColorCorrectionCollection with multiple nodes) */
export function serializeCCC(nodes: CdlNode[]): string {
  const corrections = nodes.map((node) => {
    const id = node.id ? ` id="${node.id}"` : '';
    return `  <ColorCorrection${id}>
${sopBlock(node)}
${satBlock(node)}
  </ColorCorrection>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ColorCorrectionCollection xmlns="urn:ASC:CDL:v1.01">
${corrections}
</ColorCorrectionCollection>`;
}

/** Trigger a browser download of a CDL file */
export function downloadCdl(node: CdlNode, format: 'cdl' | 'cc' | 'ccc', filename?: string): void {
  let text: string;
  let ext: string;
  if (format === 'cc') {
    text = serializeCC(node);
    ext = '.cc';
  } else if (format === 'ccc') {
    text = serializeCCC([node]);
    ext = '.ccc';
  } else {
    text = serializeCDL(node);
    ext = '.cdl';
  }
  const blob = new Blob([text], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `grade${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
