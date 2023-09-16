<script>
  import { Footer, FooterCopyright, FooterLinkGroup, FooterLink } from "flowbite-svelte";
</script>

<Footer>
  <FooterCopyright href="/" by="Stephen Ball" year={new Date().getFullYear()} />
  <FooterLinkGroup
    ulClass="flex flex-wrap items-center mt-3 text-sm text-gray-500 dark:text-gray-400 sm:mt-0"
  >
    <FooterLink href="/about">About Me</FooterLink>
    <FooterLink href="/contact">Contact</FooterLink>
  </FooterLinkGroup>
</Footer>
