'use client';

import { Card as HeroUICard } from '@heroui/react';

export function Card({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <HeroUICard {...props}>{children}</HeroUICard>;
}

export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <HeroUICard.Header {...props} />;
}

export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <HeroUICard.Title {...props} />;
}

export function CardDescription(props: React.HTMLAttributes<HTMLParagraphElement>) {
  return <HeroUICard.Description {...props} />;
}

export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  return <HeroUICard.Content {...props} />;
}

export function CardFooter(props: React.HTMLAttributes<HTMLDivElement>) {
  return <HeroUICard.Footer {...props} />;
}
