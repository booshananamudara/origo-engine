import * as React from "react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface AccordionContextValue {
  value: string
  onValueChange: (val: string) => void
}

const AccordionContext = React.createContext<AccordionContextValue>({
  value: "",
  onValueChange: () => {},
})

interface AccordionProps {
  type?: "single"
  collapsible?: boolean
  value?: string
  onValueChange?: (val: string) => void
  children: React.ReactNode
  className?: string
}

function Accordion({
  value = "",
  onValueChange = () => {},
  children,
  className,
}: AccordionProps) {
  return (
    <AccordionContext.Provider value={{ value, onValueChange }}>
      <div className={cn(className)}>{children}</div>
    </AccordionContext.Provider>
  )
}

interface AccordionItemProps {
  value: string
  children: React.ReactNode
  className?: string
}

function AccordionItem({ value, children, className }: AccordionItemProps) {
  const ctx = React.useContext(AccordionContext)
  const isOpen = ctx.value === value

  return (
    <CollapsiblePrimitive.Root
      open={isOpen}
      onOpenChange={(open) => ctx.onValueChange(open ? value : "")}
      className={cn("border-b", className)}
    >
      {children}
    </CollapsiblePrimitive.Root>
  )
}

const AccordionTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => (
  <CollapsiblePrimitive.CollapsibleTrigger
    ref={ref}
    className={cn(
      "flex w-full flex-1 items-center justify-between py-2 text-sm font-medium transition-all [&[data-state=open]>svg]:rotate-180",
      className,
    )}
    {...props}
  >
    {children}
    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200" />
  </CollapsiblePrimitive.CollapsibleTrigger>
))
AccordionTrigger.displayName = "AccordionTrigger"

const AccordionContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <CollapsiblePrimitive.CollapsibleContent
    ref={ref}
    className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("pb-1 pt-0", className)}>{children}</div>
  </CollapsiblePrimitive.CollapsibleContent>
))
AccordionContent.displayName = "AccordionContent"

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
