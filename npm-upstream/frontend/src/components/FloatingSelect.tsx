import {
	autoUpdate,
	FloatingPortal,
	offset,
	shift,
	size,
	useClick,
	useDismiss,
	useFloating,
	useInteractions,
	useListNavigation,
	useRole,
} from "@floating-ui/react";
import { IconChevronDown } from "@tabler/icons-react";
import cn from "classnames";
import { useEffect, useRef, useState } from "react";

export interface FloatingSelectOption {
	value: string;
	label: string;
}

interface FloatingSelectClassNames {
	wrap: string;
	trigger: string;
	value: string;
	chevron: string;
	list: string;
	item: string;
	itemActive: string;
	itemText: string;
}

interface FloatingSelectProps {
	value: string;
	options: FloatingSelectOption[];
	onChange: (value: string) => void;
	classNames: FloatingSelectClassNames;
	ariaLabel?: string;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	strategy?: "fixed" | "absolute";
	portalRoot?: HTMLElement | null;
	placement?: "top-start" | "top-end" | "bottom-start" | "bottom-end";
	minWidth?: number;
	maxWidth?: number;
	maxHeight?: number;
}

export function FloatingSelect({
	value,
	options,
	onChange,
	classNames,
	ariaLabel,
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
	strategy = "fixed",
	portalRoot = null,
	placement = "top-start",
	minWidth = 220,
	maxWidth = 280,
	maxHeight = 240,
}: FloatingSelectProps) {
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState<number | null>(null);
	const listRef = useRef<Array<HTMLButtonElement | null>>([]);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const prevOpenRef = useRef(false);

	const open = controlledOpen ?? uncontrolledOpen;
	const setOpen = controlledOnOpenChange ?? setUncontrolledOpen;

	const selected = options.find((o) => o.value === value) ?? options[0];

	const { refs, floatingStyles, context } = useFloating({
		open,
		onOpenChange: setOpen,
		strategy,
		placement,
		transform: false,
		whileElementsMounted: autoUpdate,
		middleware: [
			offset(8),
			size({
				apply({ rects, elements }) {
					Object.assign(elements.floating.style, {
						width: `${Math.min(Math.max(rects.reference.width, minWidth), maxWidth)}px`,
						maxHeight: `${maxHeight}px`,
					});
				},
			}),
			...(strategy === "fixed" ? [shift({ padding: 8 })] : []),
		],
	});

	const click = useClick(context);
	const dismiss = useDismiss(context);
	const role = useRole(context, { role: "listbox" });
	const listNavigation = useListNavigation(context, {
		listRef,
		activeIndex,
		onNavigate: setActiveIndex,
		loop: true,
	});

	const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
		click,
		dismiss,
		role,
		listNavigation,
	]);

	useEffect(() => {
		if (!open) {
			setActiveIndex(null);
			return;
		}
		const selectedIdx = options.findIndex((o) => o.value === value);
		setActiveIndex(selectedIdx >= 0 ? selectedIdx : 0);
	}, [open, options, value]);

	useEffect(() => {
		if (prevOpenRef.current && !open) {
			triggerRef.current?.focus();
		}
		prevOpenRef.current = open;
	}, [open]);

	return (
		<div className={classNames.wrap}>
				<button
					ref={(node) => {
						refs.setReference(node);
						triggerRef.current = node;
					}}
					type="button"
				className={classNames.trigger}
				aria-label={ariaLabel}
				aria-expanded={open}
				aria-haspopup="listbox"
				{...getReferenceProps()}
			>
				<span className={classNames.value}>{selected?.label}</span>
				<IconChevronDown
					size={11}
					className={classNames.chevron}
					style={{ transform: open ? "rotate(180deg)" : undefined }}
				/>
			</button>

			{open ? (
				strategy === "absolute" ? (
					<div
						ref={refs.setFloating}
						className={classNames.list}
						style={floatingStyles}
						{...getFloatingProps()}
					>
						{options.map((option, index) => (
							<button
								key={option.value}
								ref={(node) => {
									listRef.current[index] = node;
								}}
								type="button"
								role="option"
								aria-selected={option.value === value}
								className={cn(classNames.item, {
									[classNames.itemActive]: option.value === value,
								})}
								tabIndex={activeIndex === index ? 0 : -1}
								{...getItemProps({
									onClick: () => {
										onChange(option.value);
										setOpen(false);
									},
								})}
							>
								<span className={classNames.itemText}>{option.label}</span>
							</button>
						))}
					</div>
				) : portalRoot ? (
					<FloatingPortal root={portalRoot}>
						<div
							ref={refs.setFloating}
							className={classNames.list}
							style={floatingStyles}
							{...getFloatingProps()}
						>
							{options.map((option, index) => (
								<button
									key={option.value}
									ref={(node) => {
										listRef.current[index] = node;
									}}
									type="button"
									role="option"
									aria-selected={option.value === value}
									className={cn(classNames.item, {
										[classNames.itemActive]: option.value === value,
									})}
									tabIndex={activeIndex === index ? 0 : -1}
									{...getItemProps({
										onClick: () => {
											onChange(option.value);
											setOpen(false);
										},
									})}
								>
									<span className={classNames.itemText}>{option.label}</span>
								</button>
							))}
						</div>
					</FloatingPortal>
				) : (
					<FloatingPortal>
						<div
							ref={refs.setFloating}
							className={classNames.list}
							style={floatingStyles}
							{...getFloatingProps()}
						>
							{options.map((option, index) => (
								<button
									key={option.value}
									ref={(node) => {
										listRef.current[index] = node;
									}}
									type="button"
									role="option"
									aria-selected={option.value === value}
									className={cn(classNames.item, {
										[classNames.itemActive]: option.value === value,
									})}
									tabIndex={activeIndex === index ? 0 : -1}
									{...getItemProps({
										onClick: () => {
											onChange(option.value);
											setOpen(false);
										},
									})}
								>
									<span className={classNames.itemText}>{option.label}</span>
								</button>
							))}
						</div>
					</FloatingPortal>
				)
			) : null}
		</div>
	);
}
