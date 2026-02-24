import cn from "classnames";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { useEffect, useMemo, useState } from "react";
import Modal from "react-bootstrap/Modal";
import ReactMarkdown from "react-markdown";
import { Button } from "src/components";
import { getLocale, T } from "src/locale";
import { getHelpFile } from "src/locale/src/HelpDoc";

interface Props extends InnerModalProps {
	section: string;
	color?: string;
}

const showHelpModal = (section: string, color?: string) => {
	EasyModal.show(HelpModal, { section, color });
};

const HelpModal = EasyModal.create(({ section, color, visible, remove }: Props) => {
	const [markdownText, setMarkdownText] = useState("");
	const lang = getLocale(true);
	const parsedDoc = useMemo(() => {
		const raw = markdownText.trim();
		const headingMatch = raw.match(/^##\s+(.+?)\s*(?:\r?\n|$)/);
		const title = headingMatch?.[1]?.trim() || "Help";
		const body = headingMatch ? raw.slice(headingMatch[0].length).trim() : raw;
		return { title, body };
	}, [markdownText]);

	useEffect(() => {
		try {
			const docFile = getHelpFile(lang, section) as any;
			fetch(docFile)
				.then((response) => response.text())
				.then(setMarkdownText);
		} catch (ex: any) {
			setMarkdownText(`**ERROR:** ${ex.message}`);
		}
	}, [lang, section]);

	return (
		<Modal show={visible} onHide={remove} centered dialogClassName="nyx-help-dialog">
			<Modal.Header closeButton>
				<Modal.Title>{parsedDoc.title}</Modal.Title>
			</Modal.Header>
			<Modal.Body className="nyx-help-body">
				<ReactMarkdown>{parsedDoc.body}</ReactMarkdown>
			</Modal.Body>
			<Modal.Footer>
				<Button
					type="button"
					actionType="primary"
					className={cn("ms-auto", color ? `btn-${color}` : null)}
					data-bs-dismiss="modal"
					onClick={remove}
				>
					<T id="action.close" />
				</Button>
			</Modal.Footer>
		</Modal>
	);
});

export { showHelpModal };
