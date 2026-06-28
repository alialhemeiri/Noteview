import { Node, mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import katex from "katex";
import i18n from "../../../i18n";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    math: {
      insertInlineMath: (latex?: string) => ReturnType;
      insertBlockMath: (latex?: string) => ReturnType;
    };
  }
}

/** Shared NodeView: renders KaTeX, double-click swaps to an editable input. */
class MathNodeView {
  dom: HTMLElement;
  private render: HTMLElement;
  private editing = false;
  private block: boolean;

  constructor(
    private node: PMNode,
    private editor: Editor,
    private getPos: () => number | undefined,
    block: boolean,
  ) {
    this.block = block;
    this.dom = document.createElement(block ? "div" : "span");
    this.dom.className = block ? "nv-math nv-math-block" : "nv-math nv-math-inline";
    this.dom.setAttribute("data-type", block ? "block-math" : "inline-math");
    this.render = document.createElement(block ? "div" : "span");
    this.dom.appendChild(this.render);
    this.dom.addEventListener("dblclick", (e) => {
      e.preventDefault();
      this.startEditing();
    });
    this.draw();
  }

  private draw() {
    const latex = (this.node.attrs.latex as string) ?? "";
    this.dom.setAttribute("data-latex", latex);
    if (!latex.trim()) {
      this.render.className = "nv-math-empty";
      this.render.textContent = this.block
        ? i18n.t("editor.emptyEquation")
        : i18n.t("editor.math");
      return;
    }
    this.render.className = "";
    try {
      katex.render(latex, this.render, {
        displayMode: this.block,
        throwOnError: false,
        errorColor: "var(--danger)",
      });
    } catch {
      this.render.textContent = latex;
      this.render.classList.add("nv-math-error");
    }
  }

  private startEditing() {
    if (this.editing) return;
    this.editing = true;
    const latex = (this.node.attrs.latex as string) ?? "";
    const input = this.block
      ? document.createElement("textarea")
      : document.createElement("input");
    input.className = "nv-math-input";
    input.value = latex;
    if (this.block) (input as HTMLTextAreaElement).rows = 2;
    this.dom.classList.add("editing");
    this.render.style.display = "none";
    this.dom.appendChild(input);
    input.focus();
    input.select();

    const commit = () => {
      if (!this.editing) return;
      this.editing = false;
      const value = input.value;
      input.remove();
      this.render.style.display = "";
      this.dom.classList.remove("editing");
      const pos = this.getPos();
      if (pos === undefined) return;
      const tr = this.editor.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        latex: value,
      });
      this.editor.view.dispatch(tr);
      this.editor.view.focus();
    };

    const inputEl = input as HTMLElement;
    inputEl.addEventListener("blur", commit);
    inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && (!this.block || e.ctrlKey)) {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.editing = false;
        input.remove();
        this.render.style.display = "";
        this.dom.classList.remove("editing");
        this.editor.view.focus();
      }
    });
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (!this.editing) this.draw();
    return true;
  }

  stopEvent() {
    return this.editing;
  }

  ignoreMutation() {
    return true;
  }
}

export const InlineMath = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { latex: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-type="inline-math"]',
        getAttrs: (el) => ({ latex: (el as HTMLElement).getAttribute("data-latex") ?? "" }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "inline-math", "data-latex": node.attrs.latex }),
      node.attrs.latex as string,
    ];
  },
  addNodeView() {
    return ({ node, editor, getPos }) =>
      new MathNodeView(node, editor as Editor, getPos as () => number | undefined, false);
  },
  addCommands() {
    return {
      insertInlineMath:
        (latex = "") =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
    };
  },
});

export const BlockMath = Node.create({
  name: "blockMath",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { latex: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="block-math"]',
        getAttrs: (el) => ({ latex: (el as HTMLElement).getAttribute("data-latex") ?? "" }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "block-math", "data-latex": node.attrs.latex }),
      node.attrs.latex as string,
    ];
  },
  addNodeView() {
    return ({ node, editor, getPos }) =>
      new MathNodeView(node, editor as Editor, getPos as () => number | undefined, true);
  },
  addCommands() {
    return {
      insertBlockMath:
        (latex = "") =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
    };
  },
});
