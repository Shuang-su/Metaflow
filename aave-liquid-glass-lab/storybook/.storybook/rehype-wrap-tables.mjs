function wrapTables(node) {
  if (!Array.isArray(node.children)) return;

  node.children = node.children.map(child => {
    if (child?.type === 'element' && child.tagName === 'table') {
      return {
        type: 'element',
        tagName: 'div',
        properties: {
          className: ['study-table-wrapper']
        },
        children: [child]
      };
    }

    wrapTables(child);
    return child;
  });
}

export default function rehypeWrapTables() {
  return tree => {
    wrapTables(tree);
  };
}
