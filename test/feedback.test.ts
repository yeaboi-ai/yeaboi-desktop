import { describe, expect, it } from 'vitest';
import {
  acceptAttribute,
  attachmentPaths,
  attachmentSummary,
  classifyFile,
  formatBytes,
  issueLabels,
  issueTitle,
  mimeFor,
  routeSentence,
  submitLabel,
  type Attachment,
  type FeedbackOptions,
} from '../src/renderer/lib/yeaboi/feedback';

const OPTIONS: FeedbackOptions = {
  types: ['Bug', 'Feature', 'Improvement', 'Other'],
  areas: ['general', 'planning'],
  repo: 'yeaboi-ai/yeaboi.ai',
  image_mimes: ['image/png', 'image/jpeg'],
  text_mimes: ['text/plain', 'text/markdown', 'text/csv', 'application/json'],
  max_image_bytes: 4.5 * 1024 * 1024,
  max_text_bytes: 128 * 1024,
  max_attachments: 6,
};

function file(name: string, type: string, size = 100) {
  return { name, type, size };
}

function attachment(kind: 'image' | 'text', path: string): Attachment {
  return { path, name: path, kind, bytes: 10 };
}

describe('mimeFor', () => {
  it('takes the browser at its word when the type is one we accept', () => {
    expect(mimeFor(file('a.png', 'image/png'), OPTIONS)).toBe('image/png');
  });

  it('falls back to the extension for a file dragged in with no type', () => {
    // A .log from Finder arrives with an empty File.type.
    expect(mimeFor(file('app.log', ''), OPTIONS)).toBe('text/plain');
    expect(mimeFor(file('data.json', ''), OPTIONS)).toBe('application/json');
    expect(mimeFor(file('notes.md', ''), OPTIONS)).toBe('text/markdown');
  });

  it('ignores a charset parameter and the case of the type', () => {
    expect(mimeFor(file('a.txt', 'TEXT/PLAIN; charset=utf-8'), OPTIONS)).toBe('text/plain');
  });
});

describe('classifyFile', () => {
  it('accepts a screenshot and a log', () => {
    expect(classifyFile(file('shot.png', 'image/png'), OPTIONS)).toEqual({
      kind: 'image',
      mime: 'image/png',
    });
    expect(classifyFile(file('app.log', ''), OPTIONS)).toEqual({
      kind: 'text',
      mime: 'text/plain',
    });
  });

  it('names the file and what would work instead when the type is wrong', () => {
    const out = classifyFile(file('bundle.zip', 'application/zip'), OPTIONS);
    expect(out).toEqual({
      refusal: 'bundle.zip — attach a PNG, a JPEG, or a text file like a log.',
    });
  });

  it('states both sizes when a file is too big, per kind', () => {
    const image = classifyFile(file('huge.png', 'image/png', 6 * 1024 * 1024), OPTIONS);
    expect(image).toEqual({ refusal: 'huge.png is 6.0 MB — 4.5 MB is the most this form takes.' });
    // The text ceiling is far lower, so a 1 MB log is refused where a 1 MB PNG is not.
    const log = classifyFile(file('big.log', 'text/plain', 1024 * 1024), OPTIONS);
    expect(log).toEqual({ refusal: 'big.log is 1.0 MB — 128 KB is the most this form takes.' });
    expect(classifyFile(file('ok.png', 'image/png', 1024 * 1024), OPTIONS)).toEqual({
      kind: 'image',
      mime: 'image/png',
    });
  });

  it('refuses an empty file', () => {
    expect(classifyFile(file('empty.log', 'text/plain', 0), OPTIONS)).toEqual({
      refusal: 'empty.log is empty.',
    });
  });

  it('falls back to the backend defaults when options predate the caps', () => {
    const bare: FeedbackOptions = { types: [], areas: [], repo: 'r' };
    expect(classifyFile(file('shot.png', 'image/png'), bare)).toEqual({
      kind: 'image',
      mime: 'image/png',
    });
    expect(classifyFile(file('x.zip', 'application/zip'), bare)).toHaveProperty('refusal');
  });
});

describe('acceptAttribute', () => {
  it('offers the served mimes plus the extensions a browser mistypes', () => {
    const accept = acceptAttribute(OPTIONS);
    expect(accept).toContain('image/png');
    expect(accept).toContain('.log');
  });
});

describe('formatBytes', () => {
  it('reads as a size, not a byte count', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(24 * 1024)).toBe('24 KB');
    expect(formatBytes(4.5 * 1024 * 1024)).toBe('4.5 MB');
  });
});

describe('issueTitle', () => {
  it('prefixes the type, as the engine does', () => {
    expect(issueTitle('Bug', '  poker drops a vote ')).toBe('[Bug] poker drops a vote');
  });

  it('clamps to the 250 characters the backend keeps', () => {
    expect(issueTitle('Bug', 'x'.repeat(400))).toHaveLength(250);
  });
});

describe('issueLabels', () => {
  it('matches the engine, lowercased type and raw area', () => {
    expect(issueLabels('Improvement', 'planning')).toEqual(['type:improvement', 'area:planning']);
  });
});

describe('submitLabel and routeSentence', () => {
  it('name the route Submit will actually take', () => {
    expect(submitLabel(true)).toBe('File the issue');
    expect(submitLabel(false)).toBe('Open the issue form');
    expect(submitLabel(undefined)).toBe('Open the issue form');
    expect(routeSentence({ ...OPTIONS, has_github_token: true })).toContain('under your token');
    expect(routeSentence(OPTIONS)).toContain('your browser');
  });
});

describe('attachmentSummary and attachmentPaths', () => {
  it('counts each kind, singular and plural', () => {
    expect(attachmentSummary([])).toBe('');
    expect(attachmentSummary([attachment('image', 'a.png')])).toBe('1 screenshot');
    expect(
      attachmentSummary([
        attachment('image', 'a.png'),
        attachment('image', 'b.png'),
        attachment('text', 'c.log'),
      ]),
    ).toBe('2 screenshots · 1 file');
  });

  it('splits into the two lists the wire carries', () => {
    expect(attachmentPaths([attachment('text', 'c.log'), attachment('image', 'a.png')])).toEqual({
      image_paths: ['a.png'],
      text_paths: ['c.log'],
    });
  });
});
