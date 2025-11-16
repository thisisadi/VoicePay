import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "outline" | "destructive";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", ...props }, ref) => {
        const variants = {
            default:
                "bg-[#00e0ff] text-[#0a0f1c] hover:bg-[#00c4e6] font-medium",
            outline:
                "border border-[#2b3155] text-gray-200 hover:bg-[#1a1e36]",
            destructive:
                "bg-red-600 text-white hover:bg-red-700",
        };

        return (
            <button
                className={cn(
                    "inline-flex items-center justify-center rounded-md text-sm px-4 py-2 transition-all focus:outline-none focus:ring-2 focus:ring-[#00e0ff] focus:ring-offset-2 focus:ring-offset-[#0a0f1c]",
                    variants[variant],
                    className
                )}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = "Button";

export { Button };