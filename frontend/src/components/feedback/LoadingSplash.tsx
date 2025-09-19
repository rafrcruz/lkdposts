export const LoadingSplash = () => {
  return (
    <div className="flex-center min-h-[50vh] flex-col gap-4 text-center">
      <div className="h-16 w-16 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
      <p className="text-muted-foreground">Carregando...</p>
    </div>
  );
};
