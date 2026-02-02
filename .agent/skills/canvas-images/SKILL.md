---
name: Canvas Image Generation
description: Creating visual reports and images using node-canvas
---

# Canvas Image Generation Skill

This skill covers creating visual images for Discord embeds using node-canvas.

## Setup

```bash
bun add canvas
```

## Basic Canvas Creation

```typescript
import { createCanvas, loadImage, registerFont } from 'canvas';

// Register custom fonts (optional)
registerFont('./fonts/Inter-Regular.ttf', { family: 'Inter' });

// Create canvas
const canvas = createCanvas(800, 400);
const ctx = canvas.getContext('2d');
```

## Common Patterns

### Background with Gradient
```typescript
const gradient = ctx.createLinearGradient(0, 0, 800, 400);
gradient.addColorStop(0, '#1a1a2e');
gradient.addColorStop(1, '#16213e');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, 800, 400);
```

### Rounded Rectangle
```typescript
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
```

### Loading Remote Images
```typescript
async function loadRemoteImage(url: string): Promise<Image | null> {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return await loadImage(Buffer.from(buffer));
  } catch (error) {
    console.error('Failed to load image:', url, error);
    return null;
  }
}
```

### Drawing Circular Image (Avatar)
```typescript
function drawCircularImage(ctx, image, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}
```

### Text with Shadow
```typescript
ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
ctx.shadowBlur = 4;
ctx.shadowOffsetX = 2;
ctx.shadowOffsetY = 2;
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 24px Inter';
ctx.fillText('Title', 50, 50);
ctx.shadowColor = 'transparent';
```

### Status Indicators
```typescript
const colors = {
  success: '#10b981',
  error: '#ef4444',
  pending: '#f59e0b',
  skipped: '#6b7280',
};

function drawStatusDot(ctx, x, y, status) {
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fillStyle = colors[status];
  ctx.fill();
}
```

## Creating Claim Report Image

```typescript
export async function generateClaimReport(results: ClaimResult[]): Promise<Buffer> {
  const canvas = createCanvas(600, 400);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, 600, 400);
  
  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('Daily Claim Report', 30, 50);
  
  // Results list
  let y = 100;
  for (const result of results) {
    const icon = await loadRemoteImage(result.iconUrl);
    if (icon) {
      ctx.drawImage(icon, 30, y, 40, 40);
    }
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px sans-serif';
    ctx.fillText(result.gameName, 80, y + 25);
    
    ctx.fillStyle = result.success ? '#10b981' : '#ef4444';
    ctx.fillText(result.message, 300, y + 25);
    
    y += 60;
  }
  
  return canvas.toBuffer('image/png');
}
```

## Sending to Discord

```typescript
import { AttachmentBuilder } from 'discord.js';

const imageBuffer = await generateClaimReport(results);
const attachment = new AttachmentBuilder(imageBuffer, { name: 'report.png' });

await interaction.editReply({
  embeds: [embed],
  files: [attachment],
});
```

## Performance Tips
- Reuse canvas instances when possible
- Cache loaded images (especially icons)
- Use `toBuffer()` instead of `toDataURL()` for Discord
- Load images in parallel with `Promise.all()`
