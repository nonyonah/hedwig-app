import React, { useState, useRef, useEffect } from 'react';
import { CaretDown, Check } from '../icons/lucide-icons';
import './CustomSelect.css';

export interface SelectOption {
    value: string;
    label: string;
    icon?: string;
}

interface CustomSelectProps {
    options: SelectOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Select option',
    label
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
    };

    return (
        <div className="custom-select-container" ref={containerRef}>
            {label && <label className="custom-select-label">{label}</label>}
            <div
                className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="custom-select-value">
                    {selectedOption ? (
                        <>
                            {selectedOption.icon && (
                                <img src={selectedOption.icon} alt="" className="select-icon" />
                            )}
                            <span>{selectedOption.label}</span>
                        </>
                    ) : (
                        <span className="placeholder">{placeholder}</span>
                    )}
                </div>
                <CaretDown size={16} className={`select-caret ${isOpen ? 'rotated' : ''}`} />
            </div>

            {isOpen && (
                <div className="custom-select-dropdown">
                    {options.map((option) => (
                        <div
                            key={option.value}
                            className={`custom-select-option ${option.value === value ? 'selected' : ''}`}
                            onClick={() => handleSelect(option.value)}
                        >
                            <div className="option-content">
                                {option.icon && (
                                    <img src={option.icon} alt="" className="option-icon" />
                                )}
                                <span>{option.label}</span>
                            </div>
                            {option.value === value && <Check size={16} weight="bold" className="check-icon" />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
