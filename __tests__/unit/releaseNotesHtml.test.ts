import { htmlToTextLines, parsePatchBlocks } from '../../server/utils/releaseNotesHtml';

describe('htmlToTextLines', () => {
  it('keeps TipTap list item paragraphs on the same line as the bullet', () => {
    const html = `<ul><li><p>When a task is planned</p></li><li><p>Enable release notes</p></li></ul>`;
    expect(htmlToTextLines(html)).toEqual([
      { text: 'When a task is planned', bullet: true },
      { text: 'Enable release notes', bullet: true },
    ]);
  });

  it('keeps simple list items as bullets', () => {
    const html = '<ul><li>First</li><li>Second</li></ul>';
    expect(htmlToTextLines(html)).toEqual([
      { text: 'First', bullet: true },
      { text: 'Second', bullet: true },
    ]);
  });

  it('preserves non-list paragraphs without bullets', () => {
    expect(htmlToTextLines('<p>Intro</p><ul><li><p>Item</p></li></ul>')).toEqual([
      { text: 'Intro', bullet: false },
      { text: 'Item', bullet: true },
    ]);
  });
});

describe('parsePatchBlocks', () => {
  it('keeps bullets as listItem blocks', () => {
    const blocks = parsePatchBlocks('<ul><li><p>Alpha</p></li></ul>');
    expect(blocks).toEqual([
      {
        type: 'listItem',
        runs: [{ text: 'Alpha' }],
        ordered: false,
        index: 1,
        depth: 0,
      },
    ]);
  });

  it('keeps product h2 headings and Added/Changed/Fixed labels with bold', () => {
    const html = [
      '<h2>Core App 1.2.0</h2>',
      '<p><strong>Added</strong></p>',
      '<ul><li><p>New dashboard</p></li></ul>',
      '<p><strong>Fixed</strong></p>',
      '<ul><li><p>Login crash</p></li></ul>',
    ].join('');

    const blocks = parsePatchBlocks(html);
    expect(blocks[0]).toEqual({
      type: 'heading',
      level: 2,
      runs: [{ text: 'Core App 1.2.0' }],
    });
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      runs: [{ text: 'Added', bold: true }],
    });
    expect(blocks[2]).toMatchObject({
      type: 'listItem',
      runs: [{ text: 'New dashboard' }],
    });
    expect(blocks[3]).toEqual({
      type: 'paragraph',
      runs: [{ text: 'Fixed', bold: true }],
    });
    expect(blocks[4]).toMatchObject({
      type: 'listItem',
      runs: [{ text: 'Login crash' }],
    });
  });

  it('preserves inline bold inside paragraphs', () => {
    const blocks = parsePatchBlocks('<p>See <strong>details</strong> here</p>');
    expect(blocks).toEqual([
      {
        type: 'paragraph',
        runs: [{ text: 'See ' }, { text: 'details', bold: true }, { text: ' here' }],
      },
    ]);
  });

  it('keeps images between text blocks', () => {
    const blocks = parsePatchBlocks(
      '<p>Before</p><img src="/uploads/a.png" alt="Shot" /><p>After</p>'
    );
    expect(blocks).toEqual([
      { type: 'paragraph', runs: [{ text: 'Before' }] },
      { type: 'image', src: '/uploads/a.png', alt: 'Shot' },
      { type: 'paragraph', runs: [{ text: 'After' }] },
    ]);
  });
});
