(() => {
    const i18n = window.AVEC_I18N;
    const t = (key, fallback) => i18n ? i18n.t(key, fallback) : fallback;
    const feed = document.getElementById('newsFeed');
    const status = document.getElementById('newsStatus');
    const more = document.getElementById('newsMore');
    const filters = document.getElementById('newsFilters');
    const PAGE_SIZE = 20;
    let offset = 0;

    function dateLabel(value) {
        const locale = i18n && i18n.locale === 'en' ? 'en-US' : i18n && i18n.locale === 'sw' ? 'sw-TZ' : 'fr-FR';
        return value ? new Date(value).toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' }) : '';
    }

    function mediaUrl(item, mediaId) {
        return item.source === 'platform'
            ? `/api/public/news/media/${encodeURIComponent(mediaId)}`
            : `/api/public/news/social-media/${encodeURIComponent(mediaId)}`;
    }

    function card(item) {
        const article = document.createElement('article');
        article.className = 'feed-post public-news-item';
        const heading = document.createElement('h3');
        const label = item.content_type === 'advertisement' ? t('advertisement', 'Publicité')
            : item.content_type === 'member_publication' ? t('publication', 'Publication membre') : t('announcement', 'Actualité');
        heading.textContent = item.title || label;
        const meta = document.createElement('p');
        meta.className = 'field-hint';
        meta.textContent = `${label} · ${dateLabel(item.published_at)}${item.author_name ? ` · ${item.author_name}` : ''}`;
        const body = document.createElement('p');
        body.textContent = item.body;
        article.append(heading, meta, body);
        if (item.content_type === 'advertisement') {
            const details = document.createElement('div');
            details.className = 'product-details';
            [
                [t('price', 'Prix'), item.product_price], [t('total', 'Total'), item.product_total], [t('availability', 'Disponibilité'), item.availability],
                [t('address', 'Adresse'), item.address], [t('phone', 'Téléphone'), item.contact_phone], [t('email', 'E-mail'), item.contact_email]
            ].filter(([, value]) => value).forEach(([label, value]) => {
                const line = document.createElement('span');
                line.textContent = `${label} : ${value}`;
                details.appendChild(line);
            });
            if (details.childElementCount) article.appendChild(details);
        }
        (item.media_ids || (item.media_id ? [item.media_id] : [])).forEach(mediaId => {
            const image = document.createElement('img');
            image.className = 'feed-image';
            image.src = mediaUrl(item, mediaId);
            image.alt = item.title ? `Illustration : ${item.title}` : t('image_shared', 'Média partagé avec la publication');
            image.loading = 'lazy';
            article.appendChild(image);
        });
        const comments = document.createElement('section');
        comments.className = 'public-comments';
        const commentsTitle = document.createElement('h4');
        commentsTitle.textContent = t('comments', 'Commentaires publics');
        const commentsList = document.createElement('div');
        commentsList.className = 'comment-list';
        commentsList.textContent = t('loading', 'Chargement des commentaires…');
        comments.append(commentsTitle, commentsList);
        const form = document.createElement('form');
        form.className = 'public-comment-form';
        const commentLabel = document.createElement('label');
        commentLabel.textContent = t('add_comment', 'Ajouter un commentaire');
        const textarea = document.createElement('textarea');
        textarea.maxLength = 800;
        textarea.required = true;
        textarea.rows = 2;
        commentLabel.appendChild(textarea);
        const hint = document.createElement('small');
        hint.textContent = '0,25 USD-équivalent SANDBOX : 0,125 plateforme / 0,125 auteur. Les discussions privées et de groupe ne sont jamais facturées ici.';
        const button = document.createElement('button');
        button.className = 'btn btn-primary';
        button.type = 'submit';
        button.textContent = t('comment', 'Commenter');
        form.append(commentLabel, hint, button);
        form.addEventListener('submit', event => submitComment(event, item, textarea, commentsList));
        comments.appendChild(form);
        article.appendChild(comments);
        loadComments(item, commentsList).catch(error => { commentsList.textContent = error.message; });
        return article;
    }

    function authHeaders() {
        const token = localStorage.getItem('platformAccessToken');
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    async function loadComments(item, target) {
        const source = item.source === 'social' ? 'social' : item.source === 'member_content' ? 'member_content' : null;
        if (!source) { target.textContent = t('comments_members', 'Les commentaires sont réservés aux publications membres.'); return; }
        const response = await fetch(`/api/public/news/${source}/${encodeURIComponent(item.id)}/comments`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Commentaires indisponibles.');
        target.replaceChildren();
        if (!data.comments.length) { target.textContent = t('no_comments', 'Aucun commentaire approuvé pour le moment.'); return; }
        data.comments.forEach(comment => {
            const line = document.createElement('p');
            line.textContent = `${comment.author_name} · ${comment.body}`;
            target.appendChild(line);
        });
    }

    async function submitComment(event, item, textarea, target) {
        event.preventDefault();
        const source = item.source === 'social' ? 'social' : item.source === 'member_content' ? 'member_content' : null;
        if (!source) return;
        if (!localStorage.getItem('platformAccessToken')) {
            window.location.href = 'platform.html';
            return;
        }
        const endpoint = source === 'social'
            ? `/api/social/posts/${encodeURIComponent(item.id)}/comments`
            : `/api/public/news/member_content/${encodeURIComponent(item.id)}/comments`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), ...authHeaders() },
            body: JSON.stringify({ body: textarea.value.trim() })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Commentaire impossible.');
        textarea.value = '';
        if (data.receipt) status.textContent = `Reçu SANDBOX ${data.receipt.payment_id} : ${data.receipt.display}. ${data.receipt.split || ''}`;
        await loadComments(item, target);
    }

    async function loadSocialLinks() {
        const response = await fetch('/api/public/social-links');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        const links = document.getElementById('socialLinks');
        links.replaceChildren();
        data.links.forEach(link => {
            const anchor = document.createElement('a');
            anchor.href = link.url;
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
            anchor.textContent = link.network[0].toUpperCase() + link.network.slice(1);
            links.appendChild(anchor);
        });
    }

    async function load(reset = false) {
        if (reset) {
            offset = 0;
            feed.replaceChildren();
        }
        status.textContent = t('news_loading', 'Chargement des actualités…');
        more.hidden = true;
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
        const type = document.getElementById('newsType').value;
        const from = document.getElementById('newsFrom').value;
        const to = document.getElementById('newsTo').value;
        if (type) params.set('type', type);
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        const response = await fetch(`/api/public/news?${params}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Impossible de charger les actualités.');
        if (!data.items.length && offset === 0) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = t('news_empty', 'Aucune actualité ou publicité publique ne correspond à ces critères pour le moment.');
            feed.appendChild(empty);
        } else {
            data.items.forEach(item => feed.appendChild(card(item)));
        }
        offset += data.items.length;
        more.hidden = data.items.length < PAGE_SIZE;
        status.textContent = data.items.length ? `${offset} ${t('items_displayed', 'élément(s) affiché(s).')}` : t('feed_current', 'Fil à jour.');
    }

    filters.addEventListener('submit', event => {
        event.preventDefault();
        load(true).catch(error => { status.textContent = error.message; });
    });
    more.addEventListener('click', () => load().catch(error => { status.textContent = error.message; }));
    Promise.all([load(true), loadSocialLinks()]).catch(error => { status.textContent = error.message; });
})();
