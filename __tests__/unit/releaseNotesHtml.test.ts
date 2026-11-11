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
  it('keeps bullets as text blocks with bullet flag', () => {
    const blocks = parsePatchBlocks('<ul><li><p>Alpha</p></li></ul>');
    expect(blocks).toEqual([{ type: 'text', text: 'Alpha', bullet: true }]);
  });
});
