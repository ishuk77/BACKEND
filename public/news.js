(() => {
    const feed = document.getElementById('newsFeed');
    const status = document.getElementById('newsStatus');
    const more = document.getElementById('newsMore');
    const filters = document.getElementById('newsFilters');
    const PAGE_SIZE = 20;
    let offset = 0;

    function dateLabel(value) {
        return value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : '';
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
        const label = item.content_type === 'advertisement' ? 'Publicité'
            : item.content_type === 'member_publication' ? 'Publication membre' : 'Actualité';
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
                ['Prix', item.product_price], ['Total', item.product_total], ['Disponibilité', item.availability],
                ['Adresse', item.address], ['Téléphone', item.contact_phone], ['E-mail', item.contact_email]
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
            image.alt = item.title ? `Illustration : ${item.title}` : 'Média partagé avec la publication';
            image.loading = 'lazy';
            article.appendChild(image);
        });
        return article;
    }

    async function load(reset = false) {
        if (reset) {
            offset = 0;
            feed.replaceChildren();
        }
        status.textContent = 'Chargement des actualités…';
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
            empty.textContent = 'Aucune actualité ou publicité publique ne correspond à ces critères pour le moment.';
            feed.appendChild(empty);
        } else {
            data.items.forEach(item => feed.appendChild(card(item)));
        }
        offset += data.items.length;
        more.hidden = data.items.length < PAGE_SIZE;
        status.textContent = data.items.length ? `${offset} élément(s) affiché(s).` : 'Fil à jour.';
    }

    filters.addEventListener('submit', event => {
        event.preventDefault();
        load(true).catch(error => { status.textContent = error.message; });
    });
    more.addEventListener('click', () => load().catch(error => { status.textContent = error.message; }));
    load(true).catch(error => { status.textContent = error.message; });
})();
