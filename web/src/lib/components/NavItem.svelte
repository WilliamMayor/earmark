<script>
    import { page } from "$app/state";

    let { path, name, ...rest } = $props();

    let isActive = $derived(page.url.pathname.startsWith(path));
</script>

<a
    href={path}
    class="font-mono uppercase tracking-wider font-semibold p-1 border-l-2 md:border-l-0 md:border-b-2 hover:border-white hover:text-white {isActive
        ? 'text-white border-white'
        : 'text-white/50 border-transparent'}"
    aria-current={isActive ? "page" : undefined}
    {...rest}
>
    {name}
</a>
